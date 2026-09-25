// globalSetup do vitest (vite.config.js): roda uma vez, no processo
// principal, antes dos workers nascerem. Le as chaves da stack local com UMA
// chamada da CLI e as poe no ambiente; os workers herdam e nunca chamam a
// CLI (ver carregarChavesLocais em testes/auth/ajuda.js).
//
// Stack fora do ar nao derruba a suite: as variaveis ficam sem valor, os
// testes puros rodam, e so os que precisam das chaves falham — com a
// mensagem clara de obterChave (que tenta a CLI de novo naquele worker).
import { carregarChavesLocais } from './auth/ajuda.js'

export function prepararChaves(carregar = carregarChavesLocais, avisar = console.warn) {
  try {
    carregar()
  } catch (erro) {
    avisar(`[setup-global] chaves da stack local indisponiveis; testes que dependem dela vao falhar. ${erro.message}`)
  }
}

export default function setup() {
  prepararChaves()
}
