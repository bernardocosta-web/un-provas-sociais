import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { gzipSync } from 'node:zlib'
import { executarBackup, MARCA } from '../../scripts/backup/orquestracao.js'
import { criarClienteDrive } from '../../scripts/backup/drive.js'
import { criarHealthchecks } from '../../scripts/backup/healthchecks.js'
import { ErroBackup } from '../../scripts/backup/erros.js'
import { subirDriveFalso, TOKEN_FALSO } from './ajuda/driveFalso.js'
import { subirServidor } from './ajuda/servidor.js'

// Orquestracao com Drive e Healthchecks FALSOS (servidores HTTP locais, com
// os clientes REST de verdade), Storage em memoria e dump de mentira. O
// Supabase de verdade entra em integracao.test.js.

const PASTA = 'pasta-backup'
const AGORA = new Date('2026-09-25T06:00:00Z')

let drive
let hc
let falhaDrive
let objetos
let chamadas
beforeEach(async () => {
  falhaDrive = () => null
  drive = await subirDriveFalso({ pastas: [{ id: PASTA }], falhar: (req, url) => falhaDrive(req, url) })
  hc = await subirServidor((req, corpo, res) => { res.writeHead(200); res.end('OK') })
  objetos = {
    prints: new Map([['p1.png', { versao: 'v1', conteudo: Buffer.from('print-1') }],
      ['dir/p2.png', { versao: 'v1', conteudo: Buffer.from('print-2') }]]),
    logos: new Map([['logo.png', { versao: 'v1', conteudo: Buffer.from('logo') }]]),
  }
  chamadas = []
})
afterEach(async () => {
  await drive.fechar()
  await hc.fechar()
})

function montar(extra = {}) {
  const supabase = {
    async pingAntiPausa() { chamadas.push('ping') },
    async listar(bucket) {
      return [...objetos[bucket]].map(([caminho, o]) => ({ caminho, versao: o.versao, tamanho: o.conteudo.length, tipo: 'image/png' }))
    },
    async baixar(bucket, caminho) { chamadas.push(`baixar ${bucket}/${caminho}`); return objetos[bucket].get(caminho).conteudo },
  }
  return {
    drive: criarClienteDrive({ obterToken: async () => TOKEN_FALSO, urlApi: drive.url, esperar: async () => {} }),
    supabase,
    executarDump: async () => { chamadas.push('dump'); return gzipSync('-- dump\n') },
    healthchecks: criarHealthchecks({ pingUrl: `${hc.url}/ping/x`, rid: 'r', esperar: async () => {}, avisar: () => {} }),
    agora: () => AGORA,
    pastaId: PASTA,
    rota: 'B',
    registrar: () => {},
    ...extra,
  }
}

const pings = () => hc.requisicoes.map((r) => r.caminho.replace('/ping/x', '') || '/')
const escritasNoDrive = () => drive.requisicoes.filter((r) => r.metodo !== 'GET')
const dumps = () => [...drive.arquivos.values()].filter((a) => a.appProperties?.tipo === 'banco')
const pastaDoBucket = (bucket) => [...drive.arquivos.values()].find((a) =>
  a.appProperties?.tipo === 'pasta' && a.appProperties?.bucket === bucket)

describe('executarBackup — sucesso', () => {
  it('envia o dump com data, copia os dois buckets em subpastas e pinga start e sucesso (por ultimo)', async () => {
    const resumo = await executarBackup(montar())

    expect(dumps()).toHaveLength(1)
    expect(dumps()[0]).toMatchObject({ name: 'banco-2026-09-25.sql.gz', parents: [PASTA], mimeType: 'application/gzip',
      appProperties: { ...MARCA, tipo: 'banco', data: '2026-09-25' } })

    for (const [bucket, nomes] of [['prints', ['dir/p2.png', 'p1.png']], ['logos', ['logo.png']]]) {
      const pasta = pastaDoBucket(bucket)
      expect(pasta?.parents, `subpasta de ${bucket}`).toEqual([PASTA])
      const filhos = drive.filhos(pasta.id)
      expect(filhos.map((f) => f.name).sort()).toEqual(nomes)
      for (const f of filhos) {
        expect(f.appProperties).toMatchObject({ ...MARCA, tipo: 'objeto', bucket })
        expect(f.appProperties.chave).toMatch(/^[0-9a-f]{64}$/)
        expect(f.conteudo.toString()).toBe(objetos[bucket].get(f.name).conteudo.toString())
      }
    }

    expect(pings()).toEqual(['/start', '/'])
    const sucesso = hc.requisicoes[1]
    expect(drive.requisicoes.every((r) => r.momento < sucesso.momento)).toBe(true)
    expect(sucesso.corpo.toString()).toMatch(/banco-2026-09-25\.sql\.gz/)
    expect(resumo).toMatchObject({ dump: 'banco-2026-09-25.sql.gz', novos: { prints: 2, logos: 1 }, apagados: 0 })
    expect(chamadas).toContain('ping')
  })

  it('segunda execucao e incremental: so o objeto novo ou alterado sobe; subpastas nao duplicam', async () => {
    await executarBackup(montar())
    objetos.prints.set('p3.png', { versao: 'v1', conteudo: Buffer.from('print-3') })
    objetos.logos.set('logo.png', { versao: 'v2', conteudo: Buffer.from('logo-nova') })
    chamadas = []

    const resumo = await executarBackup(montar({ agora: () => new Date('2026-09-26T06:00:00Z') }))
    expect(resumo.novos).toEqual({ prints: 1, logos: 1 })
    expect(chamadas.filter((c) => c.startsWith('baixar'))).toEqual(['baixar prints/p3.png', 'baixar logos/logo.png'])
    const pastas = [...drive.arquivos.values()].filter((a) => a.appProperties?.tipo === 'pasta')
    expect(pastas).toHaveLength(2)
    // A versao antiga da logo continua no Drive (espelho so acrescenta).
    expect(drive.filhos(pastaDoBucket('logos').id)).toHaveLength(2)
    expect(dumps().map((d) => d.name).sort()).toEqual(['banco-2026-09-25.sql.gz', 'banco-2026-09-26.sql.gz'])
  })

  it('retencao apaga so dumps do proprio backup alem de 30 diarios + 12 mensais', async () => {
    const antigos = []
    for (let i = 0; i < 40; i++) {
      const data = new Date(Date.UTC(2026, 7, 1) + i * 86400000).toISOString().slice(0, 10) // 08-01 .. 09-09
      antigos.push(data)
      drive.arquivos.set(`velho-${data}`, { id: `velho-${data}`, name: `banco-${data}.sql.gz`, mimeType: 'application/gzip',
        parents: [PASTA], appProperties: { ...MARCA, tipo: 'banco', data }, trashed: false, createdTime: `${data}T06:05:00.000Z` })
    }
    // Estranhos: sem marca, e com marca mas de outro tipo. Nunca apagados.
    drive.arquivos.set('alheio', { id: 'alheio', name: 'banco-2020-01-01.sql.gz', mimeType: 'application/gzip',
      parents: [PASTA], appProperties: {}, trashed: false, createdTime: '2020-01-01T00:00:00Z' })
    drive.arquivos.set('outro-tipo', { id: 'outro-tipo', name: 'x', mimeType: 'text/plain',
      parents: [PASTA], appProperties: { ...MARCA, tipo: 'nota', data: '2020-01-01' }, trashed: false, createdTime: '2020-01-01T00:00:00Z' })

    const resumo = await executarBackup(montar())
    // 41 dumps (40 + hoje): ficam os 30 mais recentes (08-12..09-09 e hoje -> 08-12 em diante) + mensal de agosto (08-01).
    const ficaram = dumps().map((d) => d.appProperties.data).sort()
    expect(ficaram).toHaveLength(31)
    expect(ficaram[0]).toBe('2026-08-01')
    expect(ficaram).toContain('2026-09-25')
    expect(resumo.apagados).toBe(10)
    expect(drive.arquivos.has('alheio')).toBe(true)
    expect(drive.arquivos.has('outro-tipo')).toBe(true)
    // Apagou so depois de enviar tudo: nenhum DELETE antes do ultimo upload.
    const ultimoUpload = escritasNoDrive().filter((r) => r.metodo === 'PUT').at(-1).momento
    const deletes = escritasNoDrive().filter((r) => r.metodo === 'DELETE')
    expect(deletes).toHaveLength(10)
    expect(deletes.every((r) => r.momento > ultimoUpload)).toBe(true)
  })
})

describe('executarBackup — falhas', () => {
  it('pasta inacessivel: falha clara logo no inicio, nenhum upload, nenhum ping de sucesso, /fail com o motivo', async () => {
    const erro = await executarBackup(montar({ pastaId: 'pasta-que-nao-existe' })).catch((e) => e)
    expect(erro).toBeInstanceOf(ErroBackup)
    expect(erro.message).toMatch(/GDRIVE_FOLDER_ID/)
    expect(escritasNoDrive()).toEqual([])
    expect(chamadas).toEqual([]) // nem ping anti-pausa, nem dump, nem download
    expect(pings()).toEqual(['/start', '/fail'])
    expect(hc.requisicoes[1].corpo.toString()).toMatch(/verificacao da pasta do Drive.*GDRIVE_FOLDER_ID/s)
  })

  it('falha no meio (download de um print): /fail, sem ping de sucesso, sem retencao', async () => {
    drive.arquivos.set('velho', { id: 'velho', name: 'banco-2020-01-01.sql.gz', mimeType: 'application/gzip',
      parents: [PASTA], appProperties: { ...MARCA, tipo: 'banco', data: '2020-01-01' }, trashed: false, createdTime: '2020-01-01T00:00:00Z' })
    const deps = montar()
    deps.supabase.baixar = async (bucket, caminho) => {
      throw new ErroBackup(`Storage nao entregou "${bucket}/${caminho}": HTTP 500`, { etapa: 'Storage' })
    }
    await expect(executarBackup(deps)).rejects.toThrow(/Storage nao entregou/)
    expect(pings()).toEqual(['/start', '/fail'])
    expect(hc.requisicoes[1].corpo.toString()).toMatch(/Storage/)
    expect(escritasNoDrive().filter((r) => r.metodo === 'DELETE')).toEqual([])
  })

  it('falha no dump: /fail e nada enviado', async () => {
    const erro = await executarBackup(montar({
      executarDump: async () => { throw new ErroBackup('pg_dump terminou com codigo 1', { etapa: 'dump do banco' }) },
    })).catch((e) => e)
    expect(erro.message).toMatch(/pg_dump/)
    expect(pings()).toEqual(['/start', '/fail'])
    expect(escritasNoDrive()).toEqual([])
  })

  it('falha no upload para o Drive (cota): /fail e sem ping de sucesso', async () => {
    falhaDrive = (req, url) => (url.pathname.startsWith('/upload/') ? { status: 403, motivo: 'storageQuotaExceeded' } : null)
    await expect(executarBackup(montar())).rejects.toThrow(/storageQuotaExceeded/)
    expect(pings()).toEqual(['/start', '/fail'])
  })

  it('erro que nao e ErroBackup tambem vira /fail (e o erro original sobe)', async () => {
    const deps = montar()
    deps.supabase.pingAntiPausa = async () => { throw new TypeError('inesperado') }
    await expect(executarBackup(deps)).rejects.toThrow(TypeError)
    expect(pings()).toEqual(['/start', '/fail'])
    expect(hc.requisicoes[1].corpo.toString()).toMatch(/inesperado/)
  })

  it('Healthchecks fora do ar no /start nao impede o backup (o de sucesso e que decide)', async () => {
    await hc.fechar()
    hc = await subirServidor((req, corpo, res) => {
      res.writeHead(req.url.includes('/start') ? 500 : 200)
      res.end()
    })
    await expect(executarBackup(montar({
      healthchecks: criarHealthchecks({ pingUrl: `${hc.url}/ping/x`, rid: 'r', tentativas: 1, esperar: async () => {}, avisar: () => {} }),
    }))).resolves.toMatchObject({ dump: 'banco-2026-09-25.sql.gz' })
    expect(pings()).toEqual(['/start', '/'])
  })
})
