import { createSign } from 'node:crypto'
import { ErroBackup } from './erros.js'

// Access token do Google para a Drive API, sem googleapis (ver
// docs/runbook-backup.md, "Por que sem googleapis"): Rota B troca o refresh
// token no endpoint de token; Rota A assina um JWT RS256 com a chave da conta
// de servico (node:crypto) e troca pelo mesmo endpoint. O token vale ~1 h; um
// backup dura minutos, entao e obtido uma vez e guardado.

export const ESCOPO_DRIVE = 'https://www.googleapis.com/auth/drive.file'
const ETAPA = 'credencial Google'

const erro = (mensagem, causa) => new ErroBackup(mensagem, { etapa: ETAPA, causa })

function assinarJwt({ clientEmail, chavePrivada }, urlToken, agora) {
  const b64 = (objeto) => Buffer.from(JSON.stringify(objeto)).toString('base64url')
  const iat = Math.floor(agora.getTime() / 1000)
  const dados = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: clientEmail, scope: ESCOPO_DRIVE, aud: urlToken, iat, exp: iat + 3600,
  })}`
  try {
    const assinatura = createSign('RSA-SHA256').update(dados).sign(chavePrivada)
    return `${dados}.${assinatura.toString('base64url')}`
  } catch (causa) {
    throw erro('GDRIVE_SA_JSON: a private_key nao e uma chave RSA valida ' +
      '(confira o JSON da conta de servico; o valor nao e exibido).', causa)
  }
}

function explicarRecusa(google, status, corpo) {
  const codigo = corpo?.error ?? `HTTP ${status}`
  const detalhe = corpo?.error_description ? ` (${corpo.error_description})` : ''
  if (google.rota === 'A') {
    return `O Google recusou a conta de servico de GDRIVE_SA_JSON: ${codigo}${detalhe}. ` +
      'Confira se a chave nao foi revogada e se a Google Drive API esta habilitada.'
  }
  if (codigo === 'invalid_grant') {
    return `O Google recusou GDRIVE_REFRESH_TOKEN: ${codigo}${detalhe}. O token foi revogado, ` +
      'expirou ou foi gerado com outro client. Em "Modo de teste" ele expira em 7 dias: o app ' +
      'OAuth tem de estar "Em producao". Gere outro pelo OAuth Playground (docs/runbook-backup.md).'
  }
  if (codigo === 'invalid_client' || codigo === 'unauthorized_client') {
    return `O Google recusou o client de GDRIVE_OAUTH_CLIENT: ${codigo}${detalhe}. Confira ` +
      'client_id e client_secret do client "UN Aprovados Web" (projeto "UN Aprovados").'
  }
  return `O Google recusou a credencial da Rota B: ${codigo}${detalhe}.`
}

export function criarProvedorToken(google, {
  urlToken, fetch = globalThis.fetch, agora = () => new Date(),
} = {}) {
  let emCache = null

  async function pedir() {
    const corpo = google.rota === 'A'
      ? new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: assinarJwt(google, urlToken, agora()),
      })
      : new URLSearchParams({
        client_id: google.clientId,
        client_secret: google.clientSecret,
        refresh_token: google.refreshToken,
        grant_type: 'refresh_token',
      })

    let resposta
    try {
      resposta = await fetch(urlToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: corpo,
        signal: AbortSignal.timeout(30_000),
      })
    } catch (causa) {
      throw erro(`Nao foi possivel falar com o Google (endpoint de token): ${causa.message}`, causa)
    }
    const json = await resposta.json().catch(() => null)
    if (!resposta.ok || !json?.access_token) {
      throw erro(explicarRecusa(google, resposta.status, json))
    }
    return json.access_token
  }

  return () => {
    emCache ??= pedir().catch((e) => {
      emCache = null
      throw e
    })
    return emCache
  }
}
