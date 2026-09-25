// Ambiente dos e2e: SEMPRE a stack local do Supabase, nunca o projeto
// hospedado. O .env da raiz aponta para produção; por isso a URL vem de
// testes/local.js (a mesma dos testes de RLS/auth), a chave publicável de
// `npx supabase status -o env` (testes/auth/ajuda.js), e as duas são injetadas no processo do Vite — variável já presente no ambiente tem
// prioridade sobre o .env no Vite (loadEnv não sobrescreve process.env).
import { obterApiKey } from '../../testes/auth/ajuda.js'
import { URL_API } from '../../testes/local.js'

export const PORTA_VITE = 5174
export const URL_APP = `http://127.0.0.1:${PORTA_VITE}/un-provas-sociais/`

// Hospedeiros aceitos para o Supabase dos e2e. Qualquer outro aborta.
const HOSPEDEIROS_LOCAIS = new Set(['127.0.0.1', 'localhost'])

export function garantirLocal(url) {
  const { hostname } = new URL(url)
  if (!HOSPEDEIROS_LOCAIS.has(hostname)) {
    throw new Error(`e2e recusou Supabase fora da máquina: "${url}". Só a stack local.`)
  }
  return url
}

export function ambienteLocal() {
  const url = garantirLocal(URL_API)
  return { url, chave: obterApiKey() }
}

// Toda requisição a um projeto hospedado é abortada nas páginas de teste
// (fixture em e2e/ajuda/teste.js) e reprova o teste.
export const PADRAO_HOSPEDADO = /^https?:\/\/([^/]*\.)?supabase\.co(\/|:|$)/
