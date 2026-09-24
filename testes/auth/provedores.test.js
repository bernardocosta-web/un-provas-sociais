import { execSync } from 'node:child_process'
import { beforeAll, describe, expect, it } from 'vitest'

// Task M1-A: login só pelo Google. Todo outro provedor (e-mail/senha, magic
// link/OTP, telefone, anônimo) precisa ser recusado pela API de Auth local
// (Kong em http://127.0.0.1:54321/auth/v1). Este teste bate direto na API,
// não confia só na leitura do supabase/config.toml.

const URL_BASE_AUTH = 'http://127.0.0.1:54321/auth/v1'

// A apikey nunca é escrita no repositório: vem de ANON_KEY/PUBLISHABLE_KEY do
// ambiente, com `npx supabase status -o env` como fallback (mesma stack local
// que testes/rls/ajuda.js já assume estar de pé em 127.0.0.1).
function obterApiKey() {
  const doAmbiente = process.env.ANON_KEY || process.env.PUBLISHABLE_KEY
  if (doAmbiente) return doAmbiente

  const saida = execSync('npx supabase status -o env', { encoding: 'utf8' })
  const linha = saida
    .split('\n')
    .find((l) => l.startsWith('ANON_KEY=') || l.startsWith('PUBLISHABLE_KEY='))
  if (!linha) {
    throw new Error(
      'Não foi possível obter ANON_KEY/PUBLISHABLE_KEY de "npx supabase status -o env". ' +
        'A stack local está de pé (npx supabase start)?'
    )
  }
  return linha.split('=')[1].replace(/^"|"$/g, '')
}

async function chamarAuth(caminho, corpo, apikey) {
  const resposta = await fetch(`${URL_BASE_AUTH}${caminho}`, {
    method: 'POST',
    headers: { apikey, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
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

describe('provedores de autenticação — login só pelo Google', () => {
  let apikey

  beforeAll(() => {
    apikey = obterApiKey()
  })

  it('recusa cadastro por e-mail e senha', async () => {
    const { status, json } = await chamarAuth(
      '/signup',
      {
        email: `email-senha-${Date.now()}@exemplo.test`,
        password: 'senha-super-longa-123',
      },
      apikey
    )

    // Uma rota errada devolveria 404; uma apikey errada devolveria 401. Só um
    // 400 do próprio GoTrue com este error_code conta como "cadastro
    // recusado por o provedor de e-mail estar desligado".
    expect(status).toBe(400)
    expect(json.error_code).toBe('email_provider_disabled')
    expect(json.msg).toMatch(/email signups are disabled/i)
  })

  it('recusa login por magic link / OTP de e-mail', async () => {
    const { status, json } = await chamarAuth(
      '/otp',
      { email: `otp-${Date.now()}@exemplo.test`, create_user: true },
      apikey
    )

    expect(status).toBe(422)
    expect(json.error_code).toBe('email_provider_disabled')
    expect(json.msg).toMatch(/email logins are disabled/i)
  })

  it('recusa login anônimo', async () => {
    const { status, json } = await chamarAuth('/signup', {}, apikey)

    expect(status).toBe(422)
    expect(json.error_code).toBe('anonymous_provider_disabled')
    expect(json.msg).toMatch(/anonymous sign-ins are disabled/i)
  })

  it('recusa cadastro por telefone', async () => {
    const { status, json } = await chamarAuth(
      '/signup',
      { phone: '+5511999990000', password: 'senha-super-longa-123' },
      apikey
    )

    expect(status).toBe(400)
    expect(json.error_code).toBe('phone_provider_disabled')
    expect(json.msg).toMatch(/phone signups are disabled/i)
  })

  it('GET /settings confirma: só o Google ligado entre os provedores externos', async () => {
    const resposta = await fetch(`${URL_BASE_AUTH}/settings`, {
      headers: { apikey },
    })
    expect(resposta.status).toBe(200)
    const config = await resposta.json()

    expect(config.external.google).toBe(true)
    expect(config.external.email).toBe(false)
    expect(config.external.phone).toBe(false)
    expect(config.external.anonymous_users).toBe(false)

    const provedoresJaConferidos = ['google', 'email', 'phone', 'anonymous_users']
    for (const [provedor, ligado] of Object.entries(config.external)) {
      if (provedoresJaConferidos.includes(provedor)) continue
      expect(ligado, `provedor externo "${provedor}" deveria estar desligado`).toBe(false)
    }

    // O cadastro global (enable_signup) continua ligado — é ele que permite o
    // primeiro login do Google criar o usuário. Ver comentário em
    // supabase/config.toml, seção [auth].
    expect(config.disable_signup).toBe(false)
  })
})
