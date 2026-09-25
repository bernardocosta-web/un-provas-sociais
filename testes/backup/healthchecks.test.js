import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { criarHealthchecks } from '../../scripts/backup/healthchecks.js'
import { subirServidor } from './ajuda/servidor.js'

// Healthchecks.io simulado: servidor local que grava cada ping. `status`
// escolhe a resposta.
let hc
let status
beforeEach(async () => {
  status = () => 200
  hc = await subirServidor((req, corpo, res) => {
    res.writeHead(status(req))
    res.end('OK')
  })
})
afterEach(() => hc.fechar())

const pingUrl = () => `${hc.url}/ping/uuid-secreto`
const criar = (extra = {}) => criarHealthchecks({
  pingUrl: pingUrl(), rid: 'rid-1', esperar: async () => {}, avisar: () => {}, ...extra,
})

describe('criarHealthchecks', () => {
  it('start, sucesso e fail vao para /start, / e /fail com o mesmo rid', async () => {
    const h = criar()
    await h.inicio()
    await h.sucesso('resumo do backup')
    await h.falha('deu ruim')
    expect(hc.requisicoes.map((r) => `${r.metodo} ${r.caminho}?rid=${r.busca.get('rid')}`)).toEqual([
      'POST /ping/uuid-secreto/start?rid=rid-1',
      'POST /ping/uuid-secreto?rid=rid-1',
      'POST /ping/uuid-secreto/fail?rid=rid-1',
    ])
    expect(hc.requisicoes[1].corpo.toString()).toBe('resumo do backup')
    expect(hc.requisicoes[2].corpo.toString()).toBe('deu ruim')
  })

  it('corpo enorme e cortado (o Healthchecks guarda so os primeiros KB)', async () => {
    await criar().falha('x'.repeat(50_000))
    expect(hc.requisicoes[0].corpo.length).toBeLessThanOrEqual(10_000)
  })

  it('sucesso tenta de novo em erro e, se nao conseguir, falha SEM mostrar a URL (e segredo)', async () => {
    let restantes = 2
    status = () => (restantes-- > 0 ? 503 : 200)
    await expect(criar().sucesso('ok')).resolves.toBeUndefined()
    expect(hc.requisicoes).toHaveLength(3)

    status = () => 500
    const erro = await criar().sucesso('ok').catch((e) => e)
    expect(erro.message).toMatch(/Healthchecks/)
    expect(erro.message).not.toContain('uuid-secreto')
    expect(erro.etapa).toBe('Healthchecks')
  })

  it('inicio e falha sao melhor esforco: nao lancam, so avisam (sem a URL)', async () => {
    const avisos = []
    const h = criarHealthchecks({ pingUrl: 'http://127.0.0.1:1/ping/uuid-secreto', rid: 'r',
      esperar: async () => {}, avisar: (m) => avisos.push(m) })
    await expect(h.inicio()).resolves.toBe(false)
    await expect(h.falha('x')).resolves.toBe(false)
    expect(avisos).toHaveLength(2)
    expect(avisos.join(' ')).not.toContain('uuid-secreto')
  })
})
