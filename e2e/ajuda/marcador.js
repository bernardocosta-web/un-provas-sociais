import { randomBytes } from 'node:crypto'

// Marcador único da execução ("E2E-<timestamp>"), definido uma vez no
// processo principal (playwright.config.js) e herdado pelos workers pelo
// ambiente. Todo nome/texto criado pelos e2e começa com ele; a limpeza
// apaga "E2E-%" (inclusive sobras de execuções interrompidas).
export const PREFIXO_MARCADOR = 'E2E-'

export function marcador() {
  const valor = process.env.E2E_MARCADOR
  if (!valor?.startsWith(PREFIXO_MARCADOR)) {
    throw new Error('E2E_MARCADOR ausente: rode pelo playwright.config.js (npm run test:e2e).')
  }
  return valor
}

// Nome único dentro da execução (um teste repetido não colide com as
// sobras da tentativa anterior).
export function nome(rotulo) {
  return `${marcador()} ${rotulo} ${randomBytes(3).toString('hex')}`
}
