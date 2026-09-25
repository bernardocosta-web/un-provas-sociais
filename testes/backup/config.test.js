import { describe, it, expect } from 'vitest'
import { lerConfiguracao } from '../../scripts/backup/config.js'

const SEGREDO = 'valor-secreto-que-nao-pode-vazar'

const BASE = {
  SUPABASE_DB_URL: 'postgresql://postgres:x@pooler.exemplo.test:5432/postgres',
  SUPABASE_URL: 'https://projeto.exemplo.test/',
  SUPABASE_SERVICE_ROLE_KEY: 'chave-servico',
  GDRIVE_FOLDER_ID: 'pasta-123',
  HEALTHCHECKS_PING_URL: 'https://hc.exemplo.test/ping/abc/',
}
const ROTA_B = {
  GDRIVE_OAUTH_CLIENT: JSON.stringify({ client_id: 'cid', client_secret: 'csec' }),
  GDRIVE_REFRESH_TOKEN: 'rt',
}
const CONTA = { client_email: 'sa@exemplo.test', private_key: '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n' }

describe('lerConfiguracao', () => {
  it('Rota B quando GDRIVE_SA_JSON nao existe', () => {
    const c = lerConfiguracao({ ...BASE, ...ROTA_B })
    expect(c.google).toEqual({ rota: 'B', clientId: 'cid', clientSecret: 'csec', refreshToken: 'rt' })
    expect(c.bancoUrl).toBe(BASE.SUPABASE_DB_URL)
    expect(c.supabaseUrl).toBe('https://projeto.exemplo.test') // sem barra final
    expect(c.chaveServico).toBe('chave-servico')
    expect(c.pastaId).toBe('pasta-123')
    expect(c.pingUrl).toBe('https://hc.exemplo.test/ping/abc') // sem barra final
    expect(c.urlGoogleApi).toBe('https://www.googleapis.com')
    expect(c.urlGoogleToken).toBe('https://oauth2.googleapis.com/token')
  })

  it('Secret nao cadastrado chega como string vazia no Actions: GDRIVE_SA_JSON vazio cai na Rota B', () => {
    const c = lerConfiguracao({ ...BASE, ...ROTA_B, GDRIVE_SA_JSON: '  ' })
    expect(c.google.rota).toBe('B')
  })

  it('Rota A quando GDRIVE_SA_JSON existe', () => {
    const c = lerConfiguracao({ ...BASE, GDRIVE_SA_JSON: JSON.stringify(CONTA) })
    expect(c.google).toEqual({ rota: 'A', clientEmail: CONTA.client_email, chavePrivada: CONTA.private_key })
  })

  it('lista TODOS os nomes que faltam, sem valor nenhum', () => {
    expect(() => lerConfiguracao({ SUPABASE_URL: SEGREDO, GDRIVE_REFRESH_TOKEN: '' }))
      .toThrow(/SUPABASE_DB_URL.*SUPABASE_SERVICE_ROLE_KEY.*GDRIVE_FOLDER_ID.*HEALTHCHECKS_PING_URL.*GDRIVE_OAUTH_CLIENT.*GDRIVE_REFRESH_TOKEN/s)
    try {
      lerConfiguracao({ SUPABASE_URL: SEGREDO })
    } catch (erro) {
      expect(erro.message).not.toContain(SEGREDO)
    }
  })

  it('JSON invalido falha com o NOME do Secret e sem ecoar o valor', () => {
    let erro
    try {
      lerConfiguracao({ ...BASE, GDRIVE_OAUTH_CLIENT: `{${SEGREDO}`, GDRIVE_REFRESH_TOKEN: 'rt' })
    } catch (e) {
      erro = e
    }
    expect(erro?.message).toMatch(/GDRIVE_OAUTH_CLIENT/)
    expect(erro.message).not.toContain(SEGREDO)

    expect(() => lerConfiguracao({ ...BASE, GDRIVE_SA_JSON: SEGREDO })).toThrow(/GDRIVE_SA_JSON/)
  })

  it('JSON sem os campos esperados falha dizendo quais', () => {
    expect(() => lerConfiguracao({ ...BASE, GDRIVE_OAUTH_CLIENT: '{"client_id":"x"}', GDRIVE_REFRESH_TOKEN: 'rt' }))
      .toThrow(/GDRIVE_OAUTH_CLIENT.*client_secret/)
    expect(() => lerConfiguracao({ ...BASE, GDRIVE_SA_JSON: '{"client_email":"x"}' }))
      .toThrow(/GDRIVE_SA_JSON.*private_key/)
  })

  it('URL que nao e http(s) e recusada', () => {
    expect(() => lerConfiguracao({ ...BASE, ...ROTA_B, SUPABASE_URL: 'projeto.exemplo.test' }))
      .toThrow(/SUPABASE_URL/)
    expect(() => lerConfiguracao({ ...BASE, ...ROTA_B, HEALTHCHECKS_PING_URL: 'ftp://x' }))
      .toThrow(/HEALTHCHECKS_PING_URL/)
  })

  it('enderecos do Google podem ser trocados (so os testes usam, apontando para servidores falsos locais)', () => {
    const c = lerConfiguracao({
      ...BASE, ...ROTA_B,
      BACKUP_URL_GOOGLE_API: 'http://127.0.0.1:9999/',
      BACKUP_URL_GOOGLE_TOKEN: 'http://127.0.0.1:9999/token',
    })
    expect(c.urlGoogleApi).toBe('http://127.0.0.1:9999')
    expect(c.urlGoogleToken).toBe('http://127.0.0.1:9999/token')
  })
})
