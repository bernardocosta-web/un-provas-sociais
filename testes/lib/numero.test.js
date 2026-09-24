import { describe, it, expect } from 'vitest'
import { paraNumero, numeroOuNulo } from '../../src/lib/numero.js'

// Conversao unica de valores de formulario/URL, compartilhada por
// validacao.js, normalizarFiltros.js e ficha.js.
describe('paraNumero', () => {
  it('number passa direto', () => {
    expect(paraNumero(18.5)).toBe(18.5)
  })

  it('string e trimada e convertida', () => {
    expect(paraNumero(' 20 ')).toBe(20)
  })

  it('string vazia ou so espacos e NaN, nunca 0', () => {
    expect(paraNumero('')).toBeNaN()
    expect(paraNumero('   ')).toBeNaN()
  })

  it('null, undefined e objeto sao NaN', () => {
    expect(paraNumero(null)).toBeNaN()
    expect(paraNumero(undefined)).toBeNaN()
    expect(paraNumero({})).toBeNaN()
  })
})

describe('numeroOuNulo', () => {
  it('converte string numerica', () => {
    expect(numeroOuNulo('18.5')).toBe(18.5)
  })

  it('branco, nulo e texto invalido viram null', () => {
    expect(numeroOuNulo('')).toBeNull()
    expect(numeroOuNulo('  ')).toBeNull()
    expect(numeroOuNulo(null)).toBeNull()
    expect(numeroOuNulo(undefined)).toBeNull()
    expect(numeroOuNulo('18,5')).toBeNull()
    expect(numeroOuNulo(NaN)).toBeNull()
  })

  it('zero e numero, nao ausencia', () => {
    expect(numeroOuNulo('0')).toBe(0)
    expect(numeroOuNulo(0)).toBe(0)
  })
})
