import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { criarClienteDrive } from '../../scripts/backup/drive.js'
import { subirDriveFalso, TOKEN_FALSO } from './ajuda/driveFalso.js'

// Cliente REST da Drive API (fetch puro) contra o Drive falso local.
let drive
let falha
beforeEach(async () => {
  falha = () => null
  drive = await subirDriveFalso({ pastas: [{ id: 'raiz' }], falhar: (req, url) => falha(req, url) })
})
afterEach(() => drive.fechar())

const cliente = (extra = {}) => criarClienteDrive({
  obterToken: async () => TOKEN_FALSO, urlApi: drive.url, esperar: async () => {}, ...extra,
})

describe('criarClienteDrive', () => {
  it('obterArquivo pede os campos e suporta drives compartilhados', async () => {
    const pasta = await cliente().obterArquivo('raiz')
    expect(pasta).toMatchObject({ id: 'raiz', mimeType: 'application/vnd.google-apps.folder' })
    const req = drive.requisicoes.at(-1)
    expect(req.busca.get('fields')).toBe('id,name,mimeType,trashed')
    expect(req.busca.get('supportsAllDrives')).toBe('true')
  })

  it('enviar faz upload resumable com metadados e appProperties; o conteudo chega intacto', async () => {
    const conteudo = Buffer.from([0, 1, 2, 250, 255])
    const { id } = await cliente().enviar({
      nome: "banco-2026-09-25.sql.gz", pai: 'raiz', conteudo, mimeType: 'application/gzip',
      propriedades: { origem: 'teste', tipo: 'banco' },
    })
    const salvo = drive.arquivos.get(id)
    expect(salvo).toMatchObject({ name: 'banco-2026-09-25.sql.gz', parents: ['raiz'],
      mimeType: 'application/gzip', appProperties: { origem: 'teste', tipo: 'banco' } })
    expect(Buffer.compare(salvo.conteudo, conteudo)).toBe(0)
    const inicio = drive.requisicoes.find((r) => r.caminho === '/upload/drive/v3/files')
    expect(inicio.busca.get('supportsAllDrives')).toBe('true')
    expect(inicio.cabecalhos['x-upload-content-length']).toBe('5')
  })

  it('listar filtra por pai e appProperties (com aspas escapadas) e segue a paginacao', async () => {
    const c = cliente({ tamanhoPagina: 2 })
    for (let i = 0; i < 5; i++) {
      await c.enviar({ nome: `a${i}`, pai: 'raiz', conteudo: Buffer.from('x'), mimeType: 'text/plain',
        propriedades: { origem: "d'agua", tipo: i % 2 ? 'impar' : 'par' } })
    }
    const pares = await c.listar({ pai: 'raiz', propriedades: { origem: "d'agua", tipo: 'par' } })
    expect(pares.map((a) => a.name).sort()).toEqual(['a0', 'a2', 'a4'])
    expect(pares[0]).toHaveProperty('createdTime')
    expect(pares[0]).toHaveProperty('appProperties')
    const listas = drive.requisicoes.filter((r) => r.caminho === '/drive/v3/files' && r.metodo === 'GET')
    expect(listas.at(-1).busca.get('q')).toBe(
      "'raiz' in parents and trashed = false and appProperties has { key='origem' and value='d\\'agua' } " +
      "and appProperties has { key='tipo' and value='par' }")
    expect(listas.at(-1).busca.get('includeItemsFromAllDrives')).toBe('true')
    expect(listas.length).toBeGreaterThanOrEqual(2) // 3 resultados, pagina de 2
  })

  it('criarPasta cria pasta com appProperties dentro do pai', async () => {
    const { id } = await cliente().criarPasta({ nome: 'prints', pai: 'raiz', propriedades: { tipo: 'pasta' } })
    expect(drive.arquivos.get(id)).toMatchObject({ name: 'prints', parents: ['raiz'],
      mimeType: 'application/vnd.google-apps.folder', appProperties: { tipo: 'pasta' } })
  })

  it('apagar remove o arquivo', async () => {
    const c = cliente()
    const { id } = await c.enviar({ nome: 'x', pai: 'raiz', conteudo: Buffer.from('x'), mimeType: 'text/plain' })
    await c.apagar(id)
    expect(drive.arquivos.has(id)).toBe(false)
  })

  it('apagar e idempotente: 404 (ja apagado, p.ex. depois de um 5xx repetido) conta como sucesso', async () => {
    await expect(cliente().apagar('nao-existe')).resolves.toBeUndefined()
  })

  it('moverParaLixeira marca trashed (PATCH) e o arquivo some da listagem; 404 tambem conta como sucesso', async () => {
    const c = cliente()
    const { id } = await c.enviar({ nome: 'x', pai: 'raiz', conteudo: Buffer.from('x'), mimeType: 'text/plain',
      propriedades: { tipo: 'banco' } })
    await c.moverParaLixeira(id)
    expect(drive.arquivos.get(id).trashed).toBe(true)
    const patch = drive.requisicoes.at(-1)
    expect(patch.metodo).toBe('PATCH')
    expect(JSON.parse(patch.corpo.toString())).toEqual({ trashed: true })
    expect(patch.busca.get('supportsAllDrives')).toBe('true')
    expect(await c.listar({ pai: 'raiz', propriedades: { tipo: 'banco' } })).toEqual([])
    await expect(c.moverParaLixeira('nao-existe')).resolves.toBeUndefined()
  })

  it('erro do Drive vira ErroDrive com status e motivo', async () => {
    const erro = await cliente().obterArquivo('nao-existe').catch((e) => e)
    expect(erro.name).toBe('ErroDrive')
    expect(erro.status).toBe(404)
    expect(erro.motivo).toBe('notFound')
    expect(erro.message).toMatch(/404/)
  })

  it('429/5xx sao tentados de novo (ate 3 vezes); 4xx nao', async () => {
    let restantes = 2
    falha = () => (restantes-- > 0 ? { status: 503, motivo: 'backendError' } : null)
    await expect(cliente().obterArquivo('raiz')).resolves.toMatchObject({ id: 'raiz' })

    falha = () => ({ status: 503, motivo: 'backendError' })
    await expect(cliente().obterArquivo('raiz')).rejects.toMatchObject({ status: 503 })

    let chamadas = 0
    falha = () => { chamadas++; return { status: 403, motivo: 'insufficientPermissions' } }
    await expect(cliente().obterArquivo('raiz')).rejects.toMatchObject({ status: 403 })
    expect(chamadas).toBe(1)
  })

  it('token recusado (401) chega como ErroDrive 401', async () => {
    const c = cliente({ obterToken: async () => 'outro-token' })
    await expect(c.obterArquivo('raiz')).rejects.toMatchObject({ status: 401 })
  })
})
