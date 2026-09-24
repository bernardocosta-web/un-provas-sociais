import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// sessao.js so repassa chamadas para supabase.auth — o cliente real
// (src/dados/cliente.js) exige VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY e
// faria rede de verdade. Aqui trocamos o cliente por um dublê antes de
// importar sessao.js, para testar so a logica de repasse.

const supabaseFalso = {
  auth: {
    getUser: vi.fn(),
    signInWithOAuth: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChange: vi.fn(),
  },
}

vi.mock('../../src/dados/cliente.js', () => ({ supabase: supabaseFalso }))

let usuarioAtual
let entrarComGoogle
let sair
let aoMudarSessao

beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } })
  ;({ usuarioAtual, entrarComGoogle, sair, aoMudarSessao } = await import('../../src/dados/sessao.js'))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('usuarioAtual', () => {
  it('retorna o usuario quando data.user existe', async () => {
    supabaseFalso.auth.getUser.mockResolvedValue({ data: { user: { email: 'a@exemplo.test' } } })

    await expect(usuarioAtual()).resolves.toEqual({ email: 'a@exemplo.test' })
  })

  it('retorna null quando data.user esta ausente', async () => {
    supabaseFalso.auth.getUser.mockResolvedValue({ data: {} })

    await expect(usuarioAtual()).resolves.toBeNull()
  })

  it('retorna null quando data e ausente', async () => {
    supabaseFalso.auth.getUser.mockResolvedValue({})

    await expect(usuarioAtual()).resolves.toBeNull()
  })
})

describe('entrarComGoogle', () => {
  it('chama signInWithOAuth com provider google e redirectTo = origin + BASE_URL', async () => {
    supabaseFalso.auth.signInWithOAuth.mockResolvedValue({ error: null })

    await entrarComGoogle()

    expect(supabaseFalso.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'http://localhost:5173' + import.meta.env.BASE_URL },
    })
  })

  it('relanca o erro quando signInWithOAuth devolve { error }', async () => {
    const erro = new Error('falha de rede')
    supabaseFalso.auth.signInWithOAuth.mockResolvedValue({ error: erro })

    await expect(entrarComGoogle()).rejects.toThrow('falha de rede')
  })
})

describe('sair', () => {
  it('chama signOut', async () => {
    supabaseFalso.auth.signOut.mockResolvedValue({ error: null })

    await sair()

    expect(supabaseFalso.auth.signOut).toHaveBeenCalledTimes(1)
  })
})

describe('aoMudarSessao', () => {
  it('repassa a sessao recebida para o callback do chamador', () => {
    const assinaturaFalsa = { data: { subscription: { unsubscribe: vi.fn() } } }
    supabaseFalso.auth.onAuthStateChange.mockReturnValue(assinaturaFalsa)
    const callback = vi.fn()
    const sessaoFalsa = { user: { email: 'b@exemplo.test' } }

    const resultado = aoMudarSessao(callback)

    expect(supabaseFalso.auth.onAuthStateChange).toHaveBeenCalledTimes(1)
    const ouvinte = supabaseFalso.auth.onAuthStateChange.mock.calls[0][0]
    ouvinte('SIGNED_IN', sessaoFalsa)
    expect(callback).toHaveBeenCalledWith(sessaoFalsa)
    expect(resultado).toBe(assinaturaFalsa)
  })
})
