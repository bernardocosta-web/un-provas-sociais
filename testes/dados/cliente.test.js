import { afterEach, describe, expect, it, vi } from 'vitest'

// cliente.js lê import.meta.env.VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY no
// escopo do módulo. Para testar as duas variações (faltando/presentes),
// stubamos o env e reimportamos o módulo do zero a cada teste — sem isso o
// cache do ESM devolveria sempre a primeira instância criada.

async function importarClienteComEnv(env) {
  vi.resetModules()
  vi.unstubAllEnvs()
  for (const [chave, valor] of Object.entries(env)) {
    vi.stubEnv(chave, valor)
  }
  return import('../../src/dados/cliente.js')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('cliente supabase', () => {
  it('lanca erro claro em pt-BR quando VITE_SUPABASE_URL falta', async () => {
    await expect(
      importarClienteComEnv({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: 'chave-qualquer' })
    ).rejects.toThrow(/VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY faltando/)
  })

  it('lanca erro claro em pt-BR quando VITE_SUPABASE_ANON_KEY falta', async () => {
    await expect(
      importarClienteComEnv({ VITE_SUPABASE_URL: 'https://xxxxx.supabase.co', VITE_SUPABASE_ANON_KEY: '' })
    ).rejects.toThrow(/VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY faltando/)
  })

  it('constroi o cliente quando as duas variaveis estao presentes, sem chamada de rede', async () => {
    const { supabase } = await importarClienteComEnv({
      VITE_SUPABASE_URL: 'https://xxxxx.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'chave-qualquer',
    })

    expect(supabase).toBeTruthy()
    expect(typeof supabase.auth.signInWithOAuth).toBe('function')
  })
})
