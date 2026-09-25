import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, unlinkSync } from 'node:fs'
import { gunzipSync, gzipSync } from 'node:zlib'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { executarEnsaio } from '../../scripts/ensaio/ensaio.js'
import { executarBackup } from '../../scripts/backup/orquestracao.js'
import { criarClienteDrive } from '../../scripts/backup/drive.js'
import { criarClienteSupabase } from '../../scripts/backup/supabase.js'
import { criarExecutorDump } from '../../scripts/backup/dump.js'
import { criarHealthchecks } from '../../scripts/backup/healthchecks.js'
import { URL_API } from '../local.js'
import { obterChaveServico } from '../auth/ajuda.js'
import { conectar } from '../rls/ajuda.js'
import { subirDriveFalso, TOKEN_FALSO } from '../backup/ajuda/driveFalso.js'
import { subirServidor } from '../backup/ajuda/servidor.js'
import { subirObjeto, limparPrefixo } from '../backup/ajuda/storageLocal.js'

// Ensaio de restauracao de ponta a ponta, na stack LOCAL: semeia um
// depoimento com participacao, nota e resultado, um membro, um print e uma
// logo; gera um backup de verdade (Drive falso), grava dump e arquivos numa
// pasta temporaria como se tivessem sido baixados do Drive, e roda o ensaio.

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const CONTEINER = 'supabase_db_marco-1-schema-rls'
const MARCADOR = `BACKUP-ENSAIO-${Date.now()}`
const PRINT = `${MARCADOR}/print.webp`
const LOGO = `${MARCADOR}/logo.png`
const EMAIL = `${MARCADOR.toLowerCase()}@exemplo.test`

let pasta
let dump
let arquivos

const bancosDeEnsaio = () => spawnSync('docker', ['exec', CONTEINER, 'psql', '-U', 'postgres', '-Atc',
  "select datname from pg_database where datname like 'ensaio_restauro_%'"], { encoding: 'utf8' })
  .stdout.split('\n').filter(Boolean)

beforeAll(async () => {
  const c = await conectar()
  try {
    await c.query('insert into membro_equipe (email, nome, ativo) values ($1, $2, true)', [EMAIL, MARCADOR])
    const { rows: [d] } = await c.query(
      `insert into depoimento (texto_completo, fonte, print_path) values ($1, 'MANUAL', $2) returning id`,
      [`${MARCADOR} texto`, PRINT])
    const { rows: [pr] } = await c.query('insert into prova (nome) values ($1) returning id', [MARCADOR])
    const { rows: [ma] } = await c.query('insert into materia (nome) values ($1) returning id', [MARCADOR])
    const { rows: [cu] } = await c.query('insert into curso (nome) values ($1) returning id', [MARCADOR])
    const { rows: [pa] } = await c.query(
      'insert into participacao (depoimento_id, prova_id, ano) values ($1, $2, 2026) returning id', [d.id, pr.id])
    await c.query(`insert into nota (participacao_id, materia_id, valor_original, escala) values ($1, $2, 90, 'PERCENTUAL')`,
      [pa.id, ma.id])
    await c.query(`insert into resultado (participacao_id, curso_id, situacao) values ($1, $2, 'NAO_APROVADO')`, [pa.id, cu.id])
  } finally {
    await c.end()
  }
  await subirObjeto('prints', PRINT, Buffer.from('print'))
  await subirObjeto('logos', LOGO, Buffer.from('logo'))

  const drive = await subirDriveFalso({ pastas: [{ id: 'pasta' }] })
  const hc = await subirServidor((req, corpo, res) => { res.writeHead(200); res.end() })
  try {
    const supabase = criarClienteSupabase({ url: URL_API, chaveServico: obterChaveServico() })
    await executarBackup({
      drive: criarClienteDrive({ obterToken: async () => TOKEN_FALSO, urlApi: drive.url }),
      supabase: { ...supabase, listar: (b) => supabase.listar(b, MARCADOR) },
      executarDump: criarExecutorDump({ comando: 'docker',
        argumentos: ['exec', CONTEINER, 'pg_dump', '-U', 'postgres', '--no-owner', '--no-acl', 'postgres'] }),
      healthchecks: criarHealthchecks({ pingUrl: `${hc.url}/p`, avisar: () => {} }),
      agora: () => new Date(), pastaId: 'pasta', rota: 'B', registrar: () => {},
    })
    // "Download" do Drive: o dump e as subpastas prints/ e logos/.
    pasta = mkdtempSync(path.join(os.tmpdir(), 'ensaio-'))
    arquivos = path.join(pasta, 'arquivos')
    for (const a of drive.arquivos.values()) {
      if (a.appProperties?.tipo === 'banco') {
        dump = path.join(pasta, a.name)
        writeFileSync(dump, a.conteudo)
      } else if (a.appProperties?.tipo === 'objeto') {
        const destino = path.join(arquivos, a.appProperties.bucket, a.name)
        mkdirSync(path.dirname(destino), { recursive: true })
        writeFileSync(destino, a.conteudo)
      }
    }
  } finally {
    await drive.fechar()
    await hc.fechar()
  }
}, 120_000)

afterAll(async () => {
  for (const nome of bancosDeEnsaio().filter((n) => n.includes('_'))) {
    spawnSync('docker', ['exec', CONTEINER, 'dropdb', '-U', 'postgres', '--if-exists', '--force', nome])
  }
  if (pasta) rmSync(pasta, { recursive: true, force: true })
  const c = await conectar()
  try {
    await c.query('delete from depoimento where texto_completo like $1', [`${MARCADOR}%`])
    for (const t of ['prova', 'materia', 'curso']) await c.query(`delete from ${t} where nome = $1`, [MARCADOR])
    await c.query('delete from membro_equipe where email = $1', [EMAIL])
    const { rows: [sobra] } = await c.query(`select
      (select count(*)::int from depoimento where texto_completo like $1)
      + (select count(*)::int from prova where nome = $2) + (select count(*)::int from materia where nome = $2)
      + (select count(*)::int from curso where nome = $2)
      + (select count(*)::int from membro_equipe where email = $3) as n`, [`${MARCADOR}%`, MARCADOR, EMAIL])
    expect(sobra.n).toBe(0)
  } finally {
    await c.end()
  }
  expect(await limparPrefixo(MARCADOR)).toBe(0)
  expect(bancosDeEnsaio()).toEqual([])
}, 60_000)

const ensaiar = (extra = {}) => executarEnsaio({ dump, arquivos, conteiner: CONTEINER, prefixo: MARCADOR, ...extra })

describe('ensaio de restauracao na stack local', () => {
  it('backup integro: ENSAIO OK, com contagens, membro, amostra completa e arquivos; banco apagado', async () => {
    const d = await ensaiar()
    expect(d.veredito).toEqual({ ok: true, problemas: [] })
    expect(d.erros.inesperados).toEqual([])
    expect(d.erros.conhecidos.length).toBeLessThanOrEqual(2)
    for (const t of ['depoimento', 'participacao', 'nota', 'resultado', 'membro_equipe']) {
      expect(d.contagens[t], t).toBeGreaterThanOrEqual(1)
    }
    expect(Object.keys(d.contagens)).toHaveLength(14)
    expect(d.membrosAtivos).toBeGreaterThanOrEqual(1)
    expect(d.amostra).toMatchObject({ participacoes: expect.any(Number), notas: expect.any(Number) })
    expect(d.amostra.notas).toBeGreaterThanOrEqual(1)
    expect(d.amostra.resultados).toBeGreaterThanOrEqual(1)
    expect(d.arquivos).toMatchObject({ faltando: [], presentes: 2, metadados: 2 })
    expect(d.printsSemArquivo).toEqual([])
    expect(bancosDeEnsaio()).not.toContain(d.banco)
  }, 120_000)

  it('print ausente da pasta: REPROVADO, apontando o arquivo e o print_path', async () => {
    const caminho = path.join(arquivos, 'prints', PRINT)
    const conteudo = Buffer.from('print')
    unlinkSync(caminho)
    try {
      const d = await ensaiar()
      expect(d.veredito.ok).toBe(false)
      expect(d.arquivos.faltando).toEqual([`prints/${PRINT}`])
      expect(d.printsSemArquivo).toEqual([PRINT])
    } finally {
      writeFileSync(caminho, conteudo)
    }
  }, 120_000)

  it('erro inesperado na restauracao reprova (os dois conhecidos nao)', async () => {
    const ruim = path.join(pasta, 'banco-ruim.sql.gz')
    writeFileSync(ruim, gzipSync(Buffer.concat([gunzipSync(readFileSync(dump)),
      Buffer.from('\nselect * from tabela_que_nao_existe;\n')])))
    const d = await ensaiar({ dump: ruim })
    expect(d.veredito.ok).toBe(false)
    expect(d.erros.inesperados).toHaveLength(1)
    expect(d.erros.inesperados[0]).toMatch(/tabela_que_nao_existe/)
  }, 120_000)

  it('pela linha de comando: sai com 0, imprime o relatorio e, com --manter, deixa o banco', () => {
    const r = spawnSync(process.execPath, [path.join(raiz, 'scripts', 'ensaio-restauracao.mjs'),
      '--dump', dump, '--arquivos', arquivos, '--prefixo', MARCADOR, '--manter'], { encoding: 'utf8' })
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toMatch(/Linhas por tabela/)
    expect(r.stdout).toMatch(/ENSAIO OK/)
    const nome = /Banco de ensaio (ensaio_restauro_\w+) mantido/.exec(r.stdout)?.[1]
    expect(bancosDeEnsaio()).toContain(nome)
  }, 120_000)

  it('pela linha de comando, sem argumentos: explica o uso e sai com 2', () => {
    const r = spawnSync(process.execPath, [path.join(raiz, 'scripts', 'ensaio-restauracao.mjs')], { encoding: 'utf8' })
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/--dump/)
  })
})
