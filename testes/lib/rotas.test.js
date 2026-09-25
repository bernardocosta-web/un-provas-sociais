import { describe, it, expect } from 'vitest'
import { interpretarRota, rotaDaFicha, rotaDaLista } from '../../src/lib/rotas.js'

// Task 21 (terceira emenda): o retorno ganha `consulta` e o fallback passou
// de 'cadastros' para 'depoimentos' (a lista). Cadastros so por #/cadastros.
const lista = (consulta = '') => ({ tela: 'depoimentos', id: null, consulta })

describe('interpretarRota', () => {
  it('#/ficha abre ficha nova', () => {
    expect(interpretarRota('#/ficha')).toEqual({ tela: 'ficha', id: null, consulta: '' })
    expect(interpretarRota('#/ficha/')).toEqual({ tela: 'ficha', id: null, consulta: '' })
  })
  it('#/ficha/12 edita o depoimento 12', () => {
    expect(interpretarRota('#/ficha/12')).toEqual({ tela: 'ficha', id: 12, consulta: '' })
    expect(interpretarRota('#/ficha/12/')).toEqual({ tela: 'ficha', id: 12, consulta: '' })
  })
  it('id invalido cai na lista (nao mais em cadastros), sem consulta', () => {
    for (const hash of ['#/ficha/0', '#/ficha/abc', '#/ficha/-3', '#/ficha/1.5',
      '#/ficha/12abc', '#/ficha/99999999999999999999', '#/ficha/0?ano=2025']) {
      expect(interpretarRota(hash)).toEqual(lista())
    }
  })
  it('qualquer outra coisa cai na lista', () => {
    for (const hash of ['', '#', '#/', '#/fichas', '#/cadastrosx', '#/lixo?ano=2025',
      undefined, null]) {
      expect(interpretarRota(hash)).toEqual(lista())
    }
  })
})

describe('interpretarRota — consulta e telas novas (Task 21)', () => {
  it('hash vazio abre a lista de depoimentos', () => {
    expect(interpretarRota('')).toEqual(lista())
  })

  it('#/ (Voltar da Ficha) tambem abre a lista', () => {
    expect(interpretarRota('#/')).toEqual(lista())
  })

  it('#/depoimentos le a consulta depois do caminho', () => {
    expect(interpretarRota('#/depoimentos')).toEqual(lista())
    expect(interpretarRota('#/depoimentos?ano=2025')).toEqual(lista('ano=2025'))
    expect(interpretarRota('#/depoimentos/?ano=2025&q=ITA')).toEqual(lista('ano=2025&q=ITA'))
  })

  it('#/?consulta tambem e a lista', () => {
    expect(interpretarRota('#/?aba=MANUAL')).toEqual(lista('aba=MANUAL'))
  })

  it('#/ficha/42?aba=... le id e consulta juntos', () => {
    expect(interpretarRota('#/ficha/42?aba=GOOGLE_REVIEW'))
      .toEqual({ tela: 'ficha', id: 42, consulta: 'aba=GOOGLE_REVIEW' })
    expect(interpretarRota('#/ficha?aba=MANUAL'))
      .toEqual({ tela: 'ficha', id: null, consulta: 'aba=MANUAL' })
  })

  it('#/cadastros so abre por rota explicita', () => {
    expect(interpretarRota('#/cadastros')).toEqual({ tela: 'cadastros', id: null, consulta: '' })
    expect(interpretarRota('#/cadastros/')).toEqual({ tela: 'cadastros', id: null, consulta: '' })
  })

  it('id de ficha invalido cai na lista, nao mais em cadastros', () => {
    expect(interpretarRota('#/ficha/abc')).toEqual(lista())
  })
})

describe('rotaDaFicha — sem mudanca', () => {
  it('continua so cuidando da rota da ficha, sem consulta', () => {
    expect(rotaDaFicha(12)).toBe('#/ficha/12')
    expect(rotaDaFicha(null)).toBe('#/ficha')
  })
  it('ida e volta', () => {
    expect(interpretarRota(rotaDaFicha(7))).toEqual({ tela: 'ficha', id: 7, consulta: '' })
  })
})

describe('rotaDaLista', () => {
  it('sem consulta e so #/depoimentos', () => {
    expect(rotaDaLista('')).toBe('#/depoimentos')
    expect(rotaDaLista()).toBe('#/depoimentos')
  })
  it('com consulta vai depois do ?, e volta igual', () => {
    expect(rotaDaLista('ano=2025&q=ITA')).toBe('#/depoimentos?ano=2025&q=ITA')
    expect(interpretarRota(rotaDaLista('ano=2025&q=ITA'))).toEqual(lista('ano=2025&q=ITA'))
  })
})
