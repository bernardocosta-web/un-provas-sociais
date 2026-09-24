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
  it('com apelidos null acha pelo nome canonico', () => {
    const inst = { id: 3, nome_canonico: 'Universidade X', apelidos: null }
    expect(combina(inst, 'Universidade X')).toBe(true)
  })
  it('sem chave apelidos acha pelo nome canonico', () => {
    const inst = { id: 4, nome_canonico: 'Universidade Y' }
    expect(combina(inst, 'Universidade Y')).toBe(true)
  })
  it('termo vazio retorna true', () => expect(combina(ITA, '   ')).toBe(true))
})

describe('ordenarPorRelevancia', () => {
  it('apelido exato vem antes de trecho do nome', () => {
    const ordenada = ordenarPorRelevancia([UFMG, ITA], 'ita')
    expect(ordenada[0].id).toBe(1)
  })
  it('termo vazio ordena por nome canonico (pt-BR)', () => {
    const ordenada = ordenarPorRelevancia([UFMG, ITA], '')
    expect(ordenada[0].nome_canonico).toBe('Instituto Tecnológico de Aeronáutica')
    expect(ordenada[1].nome_canonico).toBe('Universidade Federal de Minas Gerais')
  })
})
