import { describe, it, expect } from 'vitest'
import { interpretarRota, rotaDaFicha } from '../../src/lib/rotas.js'

describe('interpretarRota', () => {
  it('#/ficha abre ficha nova', () => {
    expect(interpretarRota('#/ficha')).toEqual({ tela: 'ficha', id: null })
    expect(interpretarRota('#/ficha/')).toEqual({ tela: 'ficha', id: null })
  })
  it('#/ficha/12 edita o depoimento 12', () => {
    expect(interpretarRota('#/ficha/12')).toEqual({ tela: 'ficha', id: 12 })
    expect(interpretarRota('#/ficha/12/')).toEqual({ tela: 'ficha', id: 12 })
  })
  it('id invalido cai em cadastros', () => {
    for (const hash of ['#/ficha/0', '#/ficha/abc', '#/ficha/-3', '#/ficha/1.5',
      '#/ficha/12abc', '#/ficha/99999999999999999999']) {
      expect(interpretarRota(hash)).toEqual({ tela: 'cadastros' })
    }
  })
  it('qualquer outra coisa cai em cadastros', () => {
    for (const hash of ['', '#', '#/', '#/cadastros', '#/fichas', undefined, null]) {
      expect(interpretarRota(hash)).toEqual({ tela: 'cadastros' })
    }
  })
})

describe('rotaDaFicha', () => {
  it('monta o hash da ficha', () => {
    expect(rotaDaFicha(12)).toBe('#/ficha/12')
    expect(rotaDaFicha(null)).toBe('#/ficha')
  })
  it('ida e volta', () => {
    expect(interpretarRota(rotaDaFicha(7))).toEqual({ tela: 'ficha', id: 7 })
  })
})
