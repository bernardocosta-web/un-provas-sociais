import { execSync } from 'node:child_process'
import { URL_API } from '../local.js'

export const URL_BASE_AUTH = `${URL_API}/auth/v1`

// stderr capturado, não herdado: no sucesso a CLI escreve ali "Stopped
// services: [...]", que só poluía a saída de npm test / test:e2e; na falha,
// ele é o motivo e vai para a mensagem do erro (sem isso sobraria só
// "Command failed: ...").
export function executarComando(comando) {
  try {
    return execSync(comando, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (erro) {
    const motivo = String(erro.stderr ?? '').trim()
    if (motivo && !erro.message.includes(motivo)) erro.message += `\n${motivo}`
    throw erro
  }
}

let saidaStatusEmCache = null
function saidaStatusSupabase() {
  if (!saidaStatusEmCache) {
    saidaStatusEmCache = executarComando('npx supabase status -o env')
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

// As chaves da stack local sao lidas da CLI UMA vez por execucao e passadas
// aos processos filhos pelo ambiente: o globalSetup do vitest
// (testes/setup-global.js) e o playwright.config.js chamam
// carregarChavesLocais() no processo principal, e os workers herdam as duas
// variaveis abaixo sem nunca rodar a CLI. Varias `npx supabase status`
// simultaneas (uma por worker) disputavam o arquivo de telemetria da CLI no
// Windows (EPERM ao renomear ~/.supabase/telemetry.json.tmp). As chaves
// ficam so na memoria dos processos, nunca em disco.
export const ENV_CHAVE_ANON = 'SUPABASE_LOCAL_ANON_KEY'
export const ENV_CHAVE_SERVICO = 'SUPABASE_LOCAL_SERVICE_KEY'
const NOMES_NO_STATUS = {
  [ENV_CHAVE_ANON]: ['ANON_KEY', 'PUBLISHABLE_KEY'],
  [ENV_CHAVE_SERVICO]: ['SERVICE_ROLE_KEY', 'SECRET_KEY'],
}

function obterChave(nomeEnv) {
  if (process.env[nomeEnv]) return process.env[nomeEnv].trim()
  const nomes = NOMES_NO_STATUS[nomeEnv]
  const valor = linhaDoStatus(saidaStatusSupabase(), nomes)
  if (!valor) {
    throw new Error(
      `Não foi possível obter nenhuma de [${nomes.join(', ')}] de "npx supabase status -o env". ` +
        'A stack local está de pé (npx supabase start)?'
    )
  }
  return valor
}

// Le as duas chaves (no maximo uma chamada da CLI) e as poe no ambiente
// deste processo, para os filhos herdarem.
export function carregarChavesLocais() {
  for (const nome of [ENV_CHAVE_ANON, ENV_CHAVE_SERVICO]) process.env[nome] = obterChave(nome)
}

// apikey pública — a mesma usada pelo navegador, pode aparecer em qualquer
// requisição de teste. Nunca escrita no repositório.
export const obterApiKey = () => obterChave(ENV_CHAVE_ANON)

// service_role — só usada aqui para montar/desmontar fixtures via Admin API
// (criar/apagar usuário de teste, gerar magic link). Nunca escrita no
// repositório, nunca usada para simular uma requisição de usuário comum.
export const obterChaveServico = () => obterChave(ENV_CHAVE_SERVICO)

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
  const { status, json } = await chamarAuth(`/admin/users/${id}`, undefined, chaveServico, {
    metodo: 'DELETE',
    autorizacao: chaveServico,
  })
  if (status < 200 || status >= 300) {
    throw new Error(`Falha ao apagar usuário de teste "${id}": ${status} ${JSON.stringify(json)}`)
  }
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
    // Os e2e montam a sessão completa que o supabase-js guarda no navegador.
    expiresAt: Number(fragmento.get('expires_at')),
    expiresIn: Number(fragmento.get('expires_in')),
    tokenType: fragmento.get('token_type'),
  }
}

export function decodificarEmailDoJwt(token) {
  const payload = token.split('.')[1]
  const json = Buffer.from(payload, 'base64url').toString('utf8')
  return JSON.parse(json).email
}
