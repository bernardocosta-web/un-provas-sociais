import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { URL_API, URL_BANCO } from '../local.js'

// O Windows (winnat/Hyper-V) reserva faixas de porta dentro da faixa
// dinâmica (49152-65535) e chegou a reservar 54245-54344 — todas as portas
// padrão do Supabase local. Fora da faixa dinâmica ele não reserva. Este
// teste reprova porta local de volta para cima de 49152 e testes/local.js
// divergindo do config.toml (a única fonte das URLs locais nos testes).
const INICIO_FAIXA_DINAMICA = 49152
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const config = readFileSync(path.join(raiz, 'supabase', 'config.toml'), 'utf8')

function portaDaSecao(secao, chave = 'port') {
  const bloco = config.split(/\r?\n\[/).find((b) => b.startsWith(`${secao}]`))
  const achado = new RegExp(`^${chave} = (\\d+)`, 'm').exec(bloco ?? '')
  if (!achado) throw new Error(`[${secao}] ${chave} não encontrado no config.toml`)
  return Number(achado[1])
}

describe('portas do Supabase local', () => {
  it('nenhuma porta do config.toml fica na faixa dinâmica do Windows', () => {
    const portas = [...config.matchAll(/^#?\s*\w*port = (\d+)/gm)].map((m) => Number(m[1]))
    expect(portas.length).toBeGreaterThan(5)
    expect(portas.filter((p) => p >= INICIO_FAIXA_DINAMICA)).toEqual([])
  })

  it('testes/local.js aponta para as portas do config.toml', () => {
    expect(new URL(URL_API).port).toBe(String(portaDaSecao('api')))
    expect(new URL(URL_BANCO).port).toBe(String(portaDaSecao('db')))
  })
})
