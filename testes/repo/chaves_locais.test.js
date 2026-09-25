import { describe, it, expect } from 'vitest'
import { ENV_CHAVE_ANON, ENV_CHAVE_SERVICO } from '../auth/ajuda.js'

// Os workers do vitest nao podem rodar `npx supabase status` cada um: varias
// execucoes simultaneas da CLI disputam ~/.supabase/telemetry.json no
// Windows (EPERM). O globalSetup (testes/setup-global.js) le as chaves uma
// vez no processo principal; aqui, num worker, elas ja tem de estar no
// ambiente ANTES de qualquer helper ser chamado.
describe('chaves da stack local chegam aos workers pelo ambiente', () => {
  it.each([ENV_CHAVE_ANON, ENV_CHAVE_SERVICO])('%s definida pelo globalSetup', (nome) => {
    expect(process.env[nome], `${nome} ausente: o globalSetup nao rodou`).toMatch(/\S{20,}/)
  })
})
