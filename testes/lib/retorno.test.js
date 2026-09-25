import { describe, it, expect } from 'vitest'
import { CHAVE_RETORNO, guardarRetorno, retomarRetorno, devePreencherRetorno } from '../../src/lib/retorno.js'

// Revisao do Marco 5: o OAuth do Google volta para a base, sem o hash. Um
// link compartilhado (#/depoimentos?...) aberto deslogado se perdia no
// login. Guarda-se o hash antes do OAuth e restaura-se uma vez depois.

function storageFalso(inicial = {}) {
  const dados = { ...inicial }
  return {
    dados,
    getItem: (k) => (k in dados ? dados[k] : null),
    setItem: (k, v) => { dados[k] = String(v) },
    removeItem: (k) => { delete dados[k] },
  }
}

describe('guardarRetorno', () => {
  it('guarda uma rota da app', () => {
    const s = storageFalso()
    guardarRetorno(s, '#/depoimentos?ano=2025')
    expect(s.dados[CHAVE_RETORNO]).toBe('#/depoimentos?ano=2025')
  })

  it('hash vazio, "#", "#/" ou lixo nao guarda (e apaga um retorno velho)', () => {
    for (const hash of ['', '#', '#/', 'depoimentos', '#access_token=abc', null, undefined]) {
      const s = storageFalso({ [CHAVE_RETORNO]: '#/cadastros' })
      guardarRetorno(s, hash)
      expect(s.dados[CHAVE_RETORNO]).toBeUndefined()
    }
  })

  it('storage que lanca (modo privado, bloqueado) nao quebra o login', () => {
    const quebrado = { setItem: () => { throw new Error('x') }, removeItem: () => { throw new Error('x') } }
    expect(() => guardarRetorno(quebrado, '#/cadastros')).not.toThrow()
    expect(() => guardarRetorno(null, '#/cadastros')).not.toThrow()
  })
})

describe('retomarRetorno', () => {
  it('devolve o hash guardado uma vez so, e apaga', () => {
    const s = storageFalso({ [CHAVE_RETORNO]: '#/ficha/12' })
    expect(retomarRetorno(s)).toBe('#/ficha/12')
    expect(s.dados[CHAVE_RETORNO]).toBeUndefined()
    expect(retomarRetorno(s)).toBeNull()
  })

  it('valor adulterado (nao comeca com #/) e descartado', () => {
    const s = storageFalso({ [CHAVE_RETORNO]: 'javascript:alert(1)' })
    expect(retomarRetorno(s)).toBeNull()
    expect(s.dados[CHAVE_RETORNO]).toBeUndefined()
  })

  it('storage ausente ou que lanca devolve null', () => {
    expect(retomarRetorno(null)).toBeNull()
    expect(retomarRetorno({ getItem: () => { throw new Error('x') } })).toBeNull()
  })
})

// Revisao do Marco 5 (item deferido): so restaura sem hash explicito, senao
// um endereco direto (ex.: #/ficha/9) seria sobrescrito pelo retorno velho.
describe('devePreencherRetorno', () => {
  it('hash vazio ou "#/": restaura', () => {
    expect(devePreencherRetorno('')).toBe(true)
    expect(devePreencherRetorno('#/')).toBe(true)
  })

  it('hash explicito (ficha, cadastros, lista com consulta): nao restaura', () => {
    for (const hash of ['#/ficha/9', '#/ficha', '#/cadastros', '#/depoimentos?ano=2025']) {
      expect(devePreencherRetorno(hash)).toBe(false)
    }
  })
})
