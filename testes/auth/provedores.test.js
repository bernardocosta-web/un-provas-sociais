import { beforeAll, describe, expect, it } from 'vitest'
import {
  chamarAuth,
  criarUsuarioAdmin,
  decodificarEmailDoJwt,
  deletarUsuarioAdmin,
  obterApiKey,
  obterChaveServico,
  obterSessaoPorMagicLink,
  URL_BASE_AUTH,
} from './ajuda.js'

// Task M1-A: login só pelo Google. Todo outro provedor (e-mail/senha, magic
// link/OTP, telefone, anônimo) precisa ser recusado pela API de Auth local
// (Kong em http://127.0.0.1:54321/auth/v1). Este teste bate direto na API,
// não confia só na leitura do supabase/config.toml.

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

  it('recusa login por senha mesmo para e-mail que não existe', async () => {
    // O provedor de e-mail desligado precisa recusar ANTES de checar se a
    // conta existe — senão um 401/"invalid_credentials" aqui denunciaria
    // (por diferença de resposta) se um e-mail está cadastrado ou não.
    const { status, json } = await chamarAuth(
      '/token?grant_type=password',
      { email: `nao-existe-${Date.now()}@exemplo.test`, password: 'qualquer-coisa-123' },
      apikey
    )

    expect(status).toBe(422)
    expect(json.error_code).toBe('email_provider_disabled')
    expect(json.msg).toMatch(/email logins are disabled/i)
  })

  it('recusa login por magic link / OTP de e-mail (create_user: true)', async () => {
    const { status, json } = await chamarAuth(
      '/otp',
      { email: `otp-${Date.now()}@exemplo.test`, create_user: true },
      apikey
    )

    expect(status).toBe(422)
    expect(json.error_code).toBe('email_provider_disabled')
    expect(json.msg).toMatch(/email logins are disabled/i)
  })

  it('recusa OTP para usuário já existente (create_user: false)', async () => {
    // Com create_user:false e um e-mail que NÃO existe, o GoTrue devolve
    // "otp_disabled" (Signups not allowed for otp) — checagem de existência
    // vem antes da checagem de provedor, e não é o que este teste mede. Só
    // com um usuário que já existe o caminho chega até a checagem do
    // provedor de e-mail e devolve "email_provider_disabled". É esse o
    // cenário do brief: "provedor inteiro, incluindo usuários existentes".
    const chaveServico = obterChaveServico()
    const email = `otp-existente-${Date.now()}@exemplo.test`
    const id = await criarUsuarioAdmin(chaveServico, email)
    try {
      const { status, json } = await chamarAuth('/otp', { email, create_user: false }, apikey)

      expect(status).toBe(422)
      expect(json.error_code).toBe('email_provider_disabled')
      expect(json.msg).toMatch(/email logins are disabled/i)
    } finally {
      await deletarUsuarioAdmin(chaveServico, id)
    }
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

  it('não aplica troca de e-mail sem confirmação dupla (PUT /user)', async () => {
    // Cenário do achado da revisão: um usuário autenticado (por qualquer
    // provedor — aqui simulado via Admin API, já que o Google real ainda não
    // existe neste ambiente) tenta, via PUT /user, virar o dono do e-mail de
    // um colega de equipe sem provar que é dono dele. Isso só é seguro se a
    // troca exigir confirmação (idealmente dos dois e-mails) antes de valer
    // — nunca pode entrar direto em `email` nem no JWT.
    const chaveServico = obterChaveServico()
    const emailOriginal = `atacante-${Date.now()}@exemplo.test`
    const emailAlvo = `vitima-${Date.now()}@exemplo.test`
    const id = await criarUsuarioAdmin(chaveServico, emailOriginal)
    try {
      const { accessToken, refreshToken } = await obterSessaoPorMagicLink(chaveServico, emailOriginal)
      expect(decodificarEmailDoJwt(accessToken)).toBe(emailOriginal)

      const { status, json } = await chamarAuth(
        '/user',
        { email: emailAlvo },
        apikey,
        { metodo: 'PUT', autorizacao: accessToken }
      )

      // A API pode aceitar o pedido (200) mas só como troca pendente, ou
      // recusar de vez — o que NUNCA pode acontecer é `email` virar o e-mail
      // alvo nesta resposta.
      expect(status).toBeLessThan(500)
      expect(json.email).toBe(emailOriginal)
      if (status === 200) {
        expect(json.new_email).toBe(emailAlvo)
      }

      // Um token novo (via refresh) precisa continuar com o e-mail original —
      // é o `email` do JWT que `eh_membro_equipe()` lê.
      const { json: sessaoRenovada } = await chamarAuth(
        '/token?grant_type=refresh_token',
        { refresh_token: refreshToken },
        apikey
      )
      expect(sessaoRenovada.user.email).toBe(emailOriginal)
      expect(decodificarEmailDoJwt(sessaoRenovada.access_token)).toBe(emailOriginal)
    } finally {
      await deletarUsuarioAdmin(chaveServico, id)
    }
  })

  it('GET /settings confirma: só o Google ligado e confirmação de e-mail exigida', async () => {
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

    // Fix round 1: e-mail deve exigir confirmação (auth.email.enable_confirmations
    // = true), refletido aqui como mailer_autoconfirm = false. Sem isso, um
    // usuário novo criado por um caminho não-Google poderia entrar já
    // confirmado, sem provar que é dono do e-mail.
    expect(config.mailer_autoconfirm).toBe(false)

    // Outros provedores/flags de nível superior expostos por /settings que
    // também precisam continuar desligados.
    expect(config.saml_enabled).toBe(false)
    expect(config.passkeys_enabled).toBe(false)
  })

  it('deletarUsuarioAdmin lança erro quando a Admin API recusa a exclusão', async () => {
    const chaveServico = obterChaveServico()
    // UUID válido, mas de usuário inexistente: a Admin API responde 404.
    // Antes desta correção, deletarUsuarioAdmin ignorava o status e retornava
    // silenciosamente, vazando o usuário de teste sempre que a limpeza falhasse.
    await expect(
      deletarUsuarioAdmin(chaveServico, '00000000-0000-0000-0000-000000000000')
    ).rejects.toThrow(/404/)
  })
})
