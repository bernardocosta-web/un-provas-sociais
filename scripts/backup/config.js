import { ErroBackup } from './erros.js'

// Le e valida o ambiente do backup (Secrets do repositorio, via `env:` do
// workflow). No Actions, Secret nao cadastrado chega como string VAZIA, por
// isso vazio conta como ausente. Nenhuma mensagem de erro inclui valor.

const OBRIGATORIAS = ['SUPABASE_DB_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
  'GDRIVE_FOLDER_ID', 'HEALTHCHECKS_PING_URL']
const ROTA_B = ['GDRIVE_OAUTH_CLIENT', 'GDRIVE_REFRESH_TOKEN']

const erro = (mensagem) => new ErroBackup(mensagem, { etapa: 'configuracao' })

function valor(env, nome) {
  return String(env[nome] ?? '').trim()
}

// JSON.parse ecoa um trecho da entrada na mensagem de erro: aqui a entrada
// e segredo, entao a mensagem original e descartada.
function lerJson(env, nome, campos) {
  let objeto
  try {
    objeto = JSON.parse(valor(env, nome))
  } catch {
    throw erro(`${nome} nao e um JSON valido (confira o Secret; o valor nao e exibido).`)
  }
  const faltam = campos.filter((c) => typeof objeto?.[c] !== 'string' || !objeto[c].trim())
  if (faltam.length) {
    throw erro(`${nome} nao tem o(s) campo(s) ${faltam.join(', ')}.`)
  }
  return objeto
}

function url(env, nome, padrao) {
  const texto = valor(env, nome) || padrao
  if (!/^https?:\/\/\S+$/.test(texto)) {
    throw erro(`${nome} precisa ser um endereco http(s) (o valor nao e exibido).`)
  }
  return texto.replace(/\/+$/, '')
}

export function lerConfiguracao(env) {
  const rotaA = Boolean(valor(env, 'GDRIVE_SA_JSON'))
  const exigidas = rotaA ? OBRIGATORIAS : [...OBRIGATORIAS, ...ROTA_B]
  const faltam = exigidas.filter((nome) => !valor(env, nome))
  if (faltam.length) {
    throw erro(
      `Faltam variaveis de ambiente (Secrets do repositorio): ${faltam.join(', ')}. ` +
      (rotaA ? '' : 'Sem GDRIVE_SA_JSON o backup usa a Rota B (OAuth), que exige ' +
        'GDRIVE_OAUTH_CLIENT e GDRIVE_REFRESH_TOKEN. ') +
      'Ver docs/runbook-backup.md.')
  }

  let google
  if (rotaA) {
    const conta = lerJson(env, 'GDRIVE_SA_JSON', ['client_email', 'private_key'])
    google = { rota: 'A', clientEmail: conta.client_email, chavePrivada: conta.private_key }
  } else {
    const cliente = lerJson(env, 'GDRIVE_OAUTH_CLIENT', ['client_id', 'client_secret'])
    google = {
      rota: 'B',
      clientId: cliente.client_id,
      clientSecret: cliente.client_secret,
      refreshToken: valor(env, 'GDRIVE_REFRESH_TOKEN'),
    }
  }

  return {
    bancoUrl: valor(env, 'SUPABASE_DB_URL'),
    supabaseUrl: url(env, 'SUPABASE_URL'),
    chaveServico: valor(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    pastaId: valor(env, 'GDRIVE_FOLDER_ID'),
    pingUrl: url(env, 'HEALTHCHECKS_PING_URL'),
    google,
    // So os testes trocam: apontam para servidores falsos em 127.0.0.1.
    urlGoogleApi: url(env, 'BACKUP_URL_GOOGLE_API', 'https://www.googleapis.com'),
    urlGoogleToken: url(env, 'BACKUP_URL_GOOGLE_TOKEN', 'https://oauth2.googleapis.com/token'),
  }
}
