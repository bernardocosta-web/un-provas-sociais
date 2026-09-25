import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { gunzipSync } from 'node:zlib'
import { executarBackup, MARCA } from '../../scripts/backup/orquestracao.js'
import { criarClienteDrive } from '../../scripts/backup/drive.js'
import { criarClienteSupabase } from '../../scripts/backup/supabase.js'
import { criarExecutorDump } from '../../scripts/backup/dump.js'
import { criarHealthchecks } from '../../scripts/backup/healthchecks.js'
import { URL_API } from '../local.js'
import { obterChaveServico } from '../auth/ajuda.js'
import { conectar } from '../rls/ajuda.js'
import { subirDriveFalso, TOKEN_FALSO } from './ajuda/driveFalso.js'
import { subirServidor } from './ajuda/servidor.js'
import { subirObjeto, limparPrefixo } from './ajuda/storageLocal.js'

// Backup inteiro contra a stack LOCAL (443xx): Storage e REST de verdade,
// pg_dump 17 de dentro do conteiner do banco (esta maquina nao tem pg_dump;
// no CI o workflow instala o cliente 17), Drive e Healthchecks falsos locais.
// O dump e restaurado num banco novo do mesmo cluster (que ja tem os papeis
// do Supabase) para provar que serve. Tudo leva o marcador e e apagado no fim
// — o afterAll confere que nao sobrou nada.

const CONTEINER = 'supabase_db_marco-1-schema-rls'
const MARCADOR = `BACKUP-INT-${Date.now()}`
const BANCO_RESTAURO = `restauro_${MARCADOR.toLowerCase().replace(/-/g, '_')}`
const TABELAS = ['aluno', 'aluno_perfil', 'curso', 'depoimento', 'depoimento_canal', 'depoimento_tipo',
  'instituicao', 'instituicao_apelido', 'materia', 'membro_equipe', 'nota', 'participacao', 'prova', 'resultado']

const docker = (args, entrada) => {
  const r = spawnSync('docker', args, { input: entrada, maxBuffer: 256 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`docker ${args.slice(0, 4).join(' ')}: ${r.stderr}`)
  return r.stdout.toString('utf8')
}
const sqlNoConteiner = (banco, sql) => docker(['exec', CONTEINER, 'psql', '-U', 'postgres', '-d', banco, '-Atc', sql]).trim()

let drive
let hc
let resumo
beforeAll(async () => {
  const c = await conectar()
  try {
    await c.query(`insert into depoimento (texto_completo, fonte, print_path) values ($1, 'MANUAL', $2)`,
      [`${MARCADOR} texto`, `${MARCADOR}/print.png`])
  } finally {
    await c.end()
  }
  await subirObjeto('prints', `${MARCADOR}/print.png`, Buffer.from('conteudo-do-print'))
  await subirObjeto('logos', `${MARCADOR}/logo.png`, Buffer.from('conteudo-da-logo'))

  drive = await subirDriveFalso({ pastas: [{ id: 'pasta-backup' }] })
  hc = await subirServidor((req, corpo, res) => { res.writeHead(200); res.end('OK') })

  const supabase = criarClienteSupabase({ url: URL_API, chaveServico: obterChaveServico() })
  resumo = await executarBackup({
    drive: criarClienteDrive({ obterToken: async () => TOKEN_FALSO, urlApi: drive.url }),
    // Os buckets locais sao compartilhados com outras suites (e tem linhas
    // de storage.objects sem arquivo, semeadas por SQL em storage.test.js):
    // aqui o espelho fica restrito ao prefixo deste teste.
    supabase: { ...supabase, listar: (bucket) => supabase.listar(bucket, MARCADOR) },
    executarDump: criarExecutorDump({ comando: 'docker',
      argumentos: ['exec', CONTEINER, 'pg_dump', '-U', 'postgres', '--no-owner', '--no-acl', 'postgres'] }),
    healthchecks: criarHealthchecks({ pingUrl: `${hc.url}/ping/x`, avisar: () => {} }),
    agora: () => new Date(),
    pastaId: 'pasta-backup',
    rota: 'B',
    registrar: () => {},
  })
}, 120_000)

afterAll(async () => {
  await drive?.fechar()
  await hc?.fechar()
  docker(['exec', CONTEINER, 'dropdb', '-U', 'postgres', '--if-exists', '--force', BANCO_RESTAURO])
  const c = await conectar()
  try {
    await c.query('delete from depoimento where texto_completo like $1', [`${MARCADOR}%`])
    const sobra = await c.query(`select
      (select count(*)::int from depoimento where texto_completo like $1) as depoimentos,
      (select count(*)::int from pg_database where datname = $2) as bancos`, [`${MARCADOR}%`, BANCO_RESTAURO])
    expect(sobra.rows[0]).toEqual({ depoimentos: 0, bancos: 0 })
  } finally {
    await c.end()
  }
  expect(await limparPrefixo(MARCADOR)).toBe(0)
}, 60_000)

const dumpNoDrive = () => [...drive.arquivos.values()].find((a) => a.appProperties?.tipo === 'banco')

describe('backup contra o Supabase local', () => {
  it('termina com ping de sucesso e o resumo dos novos arquivos', () => {
    expect(resumo.novos).toEqual({ prints: 1, logos: 1 })
    expect(hc.requisicoes.map((r) => r.caminho)).toEqual(['/ping/x/start', '/ping/x'])
  })

  it('o dump no Drive e SQL gzip completo, com as 14 tabelas e o depoimento semeado', () => {
    const arquivo = dumpNoDrive()
    expect(arquivo.name).toMatch(/^banco-\d{4}-\d{2}-\d{2}\.sql\.gz$/)
    expect(arquivo.appProperties).toMatchObject({ ...MARCA, tipo: 'banco' })
    const sql = gunzipSync(arquivo.conteudo).toString('utf8')
    for (const tabela of TABELAS) expect(sql, tabela).toContain(`CREATE TABLE public.${tabela} (`)
    expect(sql).toContain(`${MARCADOR} texto`)
    expect(sql).toContain('-- PostgreSQL database dump complete')
    expect(sql).not.toMatch(/^GRANT /m) // --no-acl
  })

  it('os arquivos dos dois buckets chegaram ao Drive, byte a byte', () => {
    const objetos = [...drive.arquivos.values()].filter((a) => a.appProperties?.tipo === 'objeto')
    const porNome = Object.fromEntries(objetos.map((o) => [`${o.appProperties.bucket}:${o.name}`, o.conteudo.toString()]))
    expect(porNome).toEqual({
      [`prints:${MARCADOR}/print.png`]: 'conteudo-do-print',
      [`logos:${MARCADOR}/logo.png`]: 'conteudo-da-logo',
    })
  })

  it('o dump restaura num banco novo e devolve o depoimento semeado', () => {
    docker(['exec', CONTEINER, 'createdb', '-U', 'postgres', BANCO_RESTAURO])
    const sql = gunzipSync(dumpNoDrive().conteudo)
    docker(['exec', '-i', CONTEINER, 'psql', '-U', 'postgres', '-d', BANCO_RESTAURO, '-q', '-o', '/dev/null'], sql)
    expect(sqlNoConteiner(BANCO_RESTAURO,
      `select print_path from public.depoimento where texto_completo = '${MARCADOR} texto'`))
      .toBe(`${MARCADOR}/print.png`)
    // As 14 tabelas voltam (nao da para comparar contagens com a origem:
    // outras suites escrevem no banco local ao mesmo tempo).
    expect(Number(sqlNoConteiner(BANCO_RESTAURO, `select count(*) from pg_tables where schemaname = 'public'
      and tablename in (${TABELAS.map((t) => `'${t}'`).join(',')})`))).toBe(14)
  }, 120_000)
})
