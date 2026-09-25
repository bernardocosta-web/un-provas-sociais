import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { generateKeyPairSync, createVerify } from 'node:crypto'
import { criarProvedorToken } from '../../scripts/backup/google-token.js'
import { subirServidor, responderJson } from './ajuda/servidor.js'

// Endpoint de token do Google simulado num servidor local. A resposta de
// cada teste e escolhida por `proxima`.
let servidor
let proxima
beforeAll(async () => {
  servidor = await subirServidor((req, corpo, res) => proxima(req, corpo, res))
})
afterAll(() => servidor.fechar())

const urlToken = () => `${servidor.url}/token`
const form = (corpo) => Object.fromEntries(new URLSearchParams(corpo.toString('utf8')))

const ROTA_B = { rota: 'B', clientId: 'cid', clientSecret: 'csec', refreshToken: 'rt-secreto' }

describe('Rota B (OAuth com refresh token)', () => {
  it('troca o refresh token por access token e guarda para as proximas chamadas', async () => {
    let chamadas = 0
    proxima = (req, corpo, res) => {
      chamadas++
      responderJson(res, 200, { access_token: 'at-1', expires_in: 3599, token_type: 'Bearer' })
    }
    const obter = criarProvedorToken(ROTA_B, { urlToken: urlToken() })
    expect(await obter()).toBe('at-1')
    expect(await obter()).toBe('at-1')
    expect(chamadas).toBe(1)
    const ultima = servidor.requisicoes.at(-1)
    expect(ultima.metodo).toBe('POST')
    expect(ultima.cabecalhos['content-type']).toMatch(/application\/x-www-form-urlencoded/)
    expect(form(ultima.corpo)).toEqual({
      client_id: 'cid', client_secret: 'csec', refresh_token: 'rt-secreto', grant_type: 'refresh_token',
    })
  })

  it('invalid_grant vira mensagem clara (revogado, "Modo de teste", OAuth Playground) sem o token', async () => {
    proxima = (req, corpo, res) =>
      responderJson(res, 400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' })
    const erro = await criarProvedorToken(ROTA_B, { urlToken: urlToken() })().catch((e) => e)
    expect(erro.message).toMatch(/GDRIVE_REFRESH_TOKEN/)
    expect(erro.message).toMatch(/Em produ/)
    expect(erro.message).toMatch(/OAuth Playground/)
    expect(erro.message).not.toContain('rt-secreto')
    expect(erro.etapa).toBe('credencial Google')
  })

  it('invalid_client aponta para GDRIVE_OAUTH_CLIENT', async () => {
    proxima = (req, corpo, res) => responderJson(res, 401, { error: 'invalid_client' })
    await expect(criarProvedorToken(ROTA_B, { urlToken: urlToken() })())
      .rejects.toThrow(/GDRIVE_OAUTH_CLIENT.*UN Aprovados Web/s)
  })

  it('Google fora do ar: mensagem de rede, sem quebrar em erro cru', async () => {
    const provedor = criarProvedorToken(ROTA_B, { urlToken: 'http://127.0.0.1:1/token' })
    await expect(provedor()).rejects.toThrow(/Nao foi possivel falar com o Google/)
  })
})

describe('Rota A (conta de servico, JWT assinado localmente)', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' })
  const ROTA_A = { rota: 'A', clientEmail: 'sa@exemplo.test', chavePrivada: pem }

  it('assina um JWT RS256 com escopo drive.file e troca por access token', async () => {
    proxima = (req, corpo, res) => responderJson(res, 200, { access_token: 'at-sa', expires_in: 3600 })
    const agora = new Date('2026-09-25T06:00:00Z')
    expect(await criarProvedorToken(ROTA_A, { urlToken: urlToken(), agora: () => agora })()).toBe('at-sa')

    const { grant_type, assertion } = form(servidor.requisicoes.at(-1).corpo)
    expect(grant_type).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')
    const [cab, carga, assinatura] = assertion.split('.')
    expect(JSON.parse(Buffer.from(cab, 'base64url'))).toEqual({ alg: 'RS256', typ: 'JWT' })
    const claims = JSON.parse(Buffer.from(carga, 'base64url'))
    const iat = Math.floor(agora.getTime() / 1000)
    expect(claims).toEqual({
      iss: 'sa@exemplo.test',
      scope: 'https://www.googleapis.com/auth/drive.file',
      aud: urlToken(),
      iat,
      exp: iat + 3600,
    })
    const verificador = createVerify('RSA-SHA256')
    verificador.update(`${cab}.${carga}`)
    expect(verificador.verify(publicKey, Buffer.from(assinatura, 'base64url'))).toBe(true)
  })

  it('chave privada invalida falha apontando GDRIVE_SA_JSON', async () => {
    const provedor = criarProvedorToken({ ...ROTA_A, chavePrivada: 'nao-e-pem' }, { urlToken: urlToken() })
    await expect(provedor()).rejects.toThrow(/GDRIVE_SA_JSON/)
  })

  it('conta de servico recusada vira mensagem clara', async () => {
    proxima = (req, corpo, res) => responderJson(res, 400, { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' })
    await expect(criarProvedorToken(ROTA_A, { urlToken: urlToken() })())
      .rejects.toThrow(/GDRIVE_SA_JSON.*Invalid JWT Signature/s)
  })
})
