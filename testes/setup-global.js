// globalSetup do vitest (vite.config.js): roda uma vez, no processo
// principal, antes dos workers nascerem. Le as chaves da stack local com UMA
// chamada da CLI e as poe no ambiente; os workers herdam e nunca chamam a
// CLI (ver carregarChavesLocais em testes/auth/ajuda.js).
import { carregarChavesLocais } from './auth/ajuda.js'

export default function setup() {
  carregarChavesLocais()
}
