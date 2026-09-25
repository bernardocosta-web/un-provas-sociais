import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { criarClienteSupabase } from '../../scripts/backup/supabase.js'
import { URL_API } from '../local.js'
import { obterApiKey, obterChaveServico } from '../auth/ajuda.js'
import { subirObjeto, limparPrefixo } from './ajuda/storageLocal.js'

// Contra a stack LOCAL de verdade (443xx): listagem recursiva e paginada dos
// buckets, download e o ping anti-pausa pela API REST (grant da 0017).
const PREFIXO = `BACKUP-SUPA-${Date.now()}`

beforeAll(async () => {
  await subirObjeto('prints', `${PREFIXO}/a.png`, Buffer.from('print-a'))
  await subirObjeto('prints', `${PREFIXO}/sub/b.png`, Buffer.from('print-b'))
  await subirObjeto('prints', `${PREFIXO}/sub/fundo/c.png`, Buffer.from([0, 255, 7]))
  await subirObjeto('logos', `${PREFIXO}/logo.png`, Buffer.from('logo'))
})

afterAll(async () => {
  expect(await limparPrefixo(PREFIXO)).toBe(0)
})

const cliente = (extra = {}) => criarClienteSupabase({
  url: URL_API, chaveServico: obterChaveServico(), ...extra,
})

describe('criarClienteSupabase (Storage)', () => {
  it('lista recursivamente, atravessando paginas', async () => {
    const objetos = await cliente({ tamanhoPagina: 1 }).listar('prints', PREFIXO)
    expect(objetos.map((o) => o.caminho).sort()).toEqual([
      `${PREFIXO}/a.png`, `${PREFIXO}/sub/b.png`, `${PREFIXO}/sub/fundo/c.png`,
    ])
    for (const o of objetos) {
      expect(o.versao, `versao de ${o.caminho}`).toMatch(/\S/)
      expect(o.tamanho).toBeGreaterThan(0)
    }
  })

  it('versao muda quando o objeto e sobrescrito', async () => {
    const antes = (await cliente().listar('logos', PREFIXO))[0]
    await new Promise((ok) => setTimeout(ok, 20))
    const chave = obterChaveServico()
    const r = await fetch(`${URL_API}/storage/v1/object/logos/${PREFIXO}/logo.png`, {
      method: 'PUT', headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'image/png' },
      body: Buffer.from('logo-nova'),
    })
    expect(r.ok).toBe(true)
    const depois = (await cliente().listar('logos', PREFIXO))[0]
    expect(depois.versao).not.toBe(antes.versao)
  })

  it('baixa o conteudo exato (bucket privado, com a chave de servico)', async () => {
    const conteudo = await cliente().baixar('prints', `${PREFIXO}/sub/fundo/c.png`)
    expect(Buffer.compare(conteudo, Buffer.from([0, 255, 7]))).toBe(0)
  })

  it('objeto inexistente: erro claro com bucket e caminho', async () => {
    await expect(cliente().baixar('prints', `${PREFIXO}/nao-existe.png`))
      .rejects.toThrow(/prints\/BACKUP-SUPA-\d+\/nao-existe\.png/)
  })
})

describe('ping anti-pausa (REST em curso)', () => {
  it('passa com a chave de servico (grant select da 0017)', async () => {
    await expect(cliente().pingAntiPausa()).resolves.toBeUndefined()
  })

  it('sem o grant (anon nao tem) falha com mensagem que aponta a 0017', async () => {
    const erro = await cliente({ chaveServico: obterApiKey() }).pingAntiPausa().catch((e) => e)
    expect(erro.message).toMatch(/0017_ping_backup/)
    expect(erro.etapa).toBe('ping anti-pausa')
  })
})
