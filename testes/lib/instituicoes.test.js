import { describe, it, expect } from 'vitest'
import { normalizar, combina, ordenarPorRelevancia } from '../../src/lib/instituicoes.js'

const ITA = {
  id: 1,
  nome_canonico: 'Instituto Tecnológico de Aeronáutica',
  apelidos: ['ITA', 'Tecnológico de Aeronáutica'],
}
const UFMG = { id: 2, nome_canonico: 'Universidade Federal de Minas Gerais', apelidos: ['UFMG'] }

describe('normalizar', () => {
  it('remove acento e caixa', () => {
    expect(normalizar('Aeronáutica')).toBe('aeronautica')
  })
  it('colapsa espaco', () => {
    expect(normalizar('  ITA   Sao   Jose ')).toBe('ita sao jose')
  })
})

describe('combina', () => {
  it('acha pela sigla', () => expect(combina(ITA, 'ITA')).toBe(true))
  it('acha em caixa baixa', () => expect(combina(ITA, 'ita')).toBe(true))
  it('acha por apelido longo', () => expect(combina(ITA, 'Tecnológico de Aeronáutica')).toBe(true))
  it('acha por trecho do nome canonico sem acento', () =>
    expect(combina(ITA, 'aeronautica')).toBe(true))
  it('nao acha o que nao e', () => expect(combina(ITA, 'UFMG')).toBe(false))
})

describe('ordenarPorRelevancia', () => {
  it('apelido exato vem antes de trecho do nome', () => {
    const ordenada = ordenarPorRelevancia([UFMG, ITA], 'ita')
    expect(ordenada[0].id).toBe(1)
  })
})
