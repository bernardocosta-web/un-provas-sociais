import { execSync } from 'node:child_process'

export const URL_BASE_AUTH = 'http://127.0.0.1:54321/auth/v1'

let saidaStatusEmCache = null
function saidaStatusSupabase() {
  if (!saidaStatusEmCache) {
    saidaStatusEmCache = execSync('npx supabase status -o env', { encoding: 'utf8' })
  }
  return saidaStatusEmCache
}

// CRLF no Windows: cada linha é aparada antes de comparar/repartir.
function linhaDoStatus(saida, nomes) {
  const linhas = saida.split(/\r?\n/)
  for (const nome of nomes) {
    const linha = linhas.map((l) => l.trim()).find((l) => l.startsWith(`${nome}=`))
    if (linha) return linha.slice(nome.length + 1).replace(/^"|"$/g, '')
  }
  return null
}

function obterChave(nomesEnv) {
  for (const nome of nomesEnv) {
    if (process.env[nome]) return process.env[nome].trim()
  }
  const valor = linhaDoStatus(saidaStatusSupabase(), nomesEnv)
  if (!valor) {
    throw new Error(
      `Não foi possível obter nenhuma de [${nomesEnv.join(', ')}] de "npx supabase status -o env". ` +
        'A stack local está de pé (npx supabase start)?'
    )
  }
  return valor
}

// apikey pública — a mesma usada pelo navegador, pode aparecer em qualquer
// requisição de teste. Nunca escrita no repositório.
export const obterApiKey = () => obterChave(['ANON_KEY', 'PUBLISHABLE_KEY'])

// service_role — só usada aqui para montar/desmontar fixtures via Admin API
// (criar/apagar usuário de teste, gerar magic link). Nunca escrita no
// repositório, nunca usada para simular uma requisição de usuário comum.
export const obterChaveServico = () => obterChave(['SERVICE_ROLE_KEY', 'SECRET_KEY'])

export async function chamarAuth(caminho, corpo, apikey, opcoes = {}) {
  const resposta = await fetch(`${URL_BASE_AUTH}${caminho}`, {
    method: opcoes.metodo ?? 'POST',
    headers: {
      apikey,
      'Content-Type': 'application/json',
      ...(opcoes.autorizacao ? { Authorization: `Bearer ${opcoes.autorizacao}` } : {}),
    },
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
  })
  const texto = await resposta.text()
  let json = null
  try {
    json = JSON.parse(texto)
  } catch {
    // resposta não-JSON (ex.: erro de roteamento) — texto cru fica disponível
  }
  return { status: resposta.status, json, texto }
}

export async function criarUsuarioAdmin(chaveServico, email) {
  const { status, json } = await chamarAuth(
    '/admin/users',
    { email, email_confirm: true, password: `fixture-${Date.now()}-${Math.random()}` },
    chaveServico,
    { autorizacao: chaveServico }
  )
  if (status !== 200) {
    throw new Error(`Falha ao criar usuário de teste "${email}": ${status} ${JSON.stringify(json)}`)
  }
  return json.id
}

export async function deletarUsuarioAdmin(chaveServico, id) {
  await chamarAuth(`/admin/users/${id}`, undefined, chaveServico, {
    metodo: 'DELETE',
    autorizacao: chaveServico,
  })
}

// Não há credenciais reais do Google neste ambiente ainda (Task 13, manual).
// A única forma legítima de obter uma sessão de verdade para um usuário de
// teste é a própria Admin API do GoTrue gerar um magic link e completar o
// /verify — não é um contorno do provedor desligado, é a API administrativa,
// que só a service_role key acessa.
export async function obterSessaoPorMagicLink(chaveServico, email) {
  const { status, json } = await chamarAuth(
    '/admin/generate_link',
    { type: 'magiclink', email },
    chaveServico,
    { autorizacao: chaveServico }
  )
  if (status !== 200) {
    throw new Error(`Falha ao gerar magic link para "${email}": ${status} ${JSON.stringify(json)}`)
  }

  const resposta = await fetch(
    `${URL_BASE_AUTH}/verify?token=${json.hashed_token}&type=magiclink&redirect_to=http://127.0.0.1:3000`,
    { redirect: 'manual' }
  )
  const local = resposta.headers.get('location')
  if (!local || !local.includes('access_token=')) {
    throw new Error(`/verify não devolveu uma sessão (status ${resposta.status}, location "${local}")`)
  }
  const fragmento = new URLSearchParams(local.split('#')[1])
  return {
    accessToken: fragmento.get('access_token'),
    refreshToken: fragmento.get('refresh_token'),
  }
}

export function decodificarEmailDoJwt(token) {
  const payload = token.split('.')[1]
  const json = Buffer.from(payload, 'base64url').toString('utf8')
  return JSON.parse(json).email
}
