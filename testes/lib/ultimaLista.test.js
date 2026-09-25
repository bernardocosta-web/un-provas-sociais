import { describe, it, expect } from 'vitest'
import { CHAVE_ULTIMA_LISTA, guardarUltimaLista, rotaVoltarLista } from '../../src/lib/ultimaLista.js'

// M5-A item 3: o botao "Voltar a lista" da ficha volta com os mesmos
// filtros e a mesma aba de antes. Guardado ao sair da lista para a ficha.

function storageFalso(inicial = {}) {
  const dados = { ...inicial }
  return {
    dados,
    getItem: (k) => (k in dados ? dados[k] : null),
    setItem: (k, v) => { dados[k] = String(v) },
    removeItem: (k) => { delete dados[k] },
  }
}

describe('guardarUltimaLista', () => {
  it('guarda uma rota de lista, normalizada por rotaDaLista', () => {
    const s = storageFalso()
    guardarUltimaLista(s, '#/depoimentos?aba=MANUAL&ano=2025')
    expect(s.dados[CHAVE_ULTIMA_LISTA]).toBe('#/depoimentos?aba=MANUAL&ano=2025')
  })

  it('hash vazio ou "#/" guarda como a lista em branco', () => {
    const s = storageFalso()
    guardarUltimaLista(s, '#/')
    expect(s.dados[CHAVE_ULTIMA_LISTA]).toBe('#/depoimentos')
  })

  it('rota de ficha, cadastros ou lixo nao guarda (e apaga um valor velho)', () => {
    for (const hash of ['#/ficha', '#/ficha/12', '#/cadastros', '#access_token=abc', 'lixo']) {
      const s = storageFalso({ [CHAVE_ULTIMA_LISTA]: '#/depoimentos?aba=MANUAL' })
      guardarUltimaLista(s, hash)
      expect(s.dados[CHAVE_ULTIMA_LISTA]).toBeUndefined()
    }
  })

  it('storage que lanca (modo privado, bloqueado) nao quebra a navegacao', () => {
    const quebrado = { setItem: () => { throw new Error('x') }, removeItem: () => { throw new Error('x') } }
    expect(() => guardarUltimaLista(quebrado, '#/depoimentos')).not.toThrow()
    expect(() => guardarUltimaLista(null, '#/depoimentos')).not.toThrow()
  })
})

describe('rotaVoltarLista', () => {
  it('devolve a rota guardada', () => {
    const s = storageFalso({ [CHAVE_ULTIMA_LISTA]: '#/depoimentos?aba=GOOGLE_REVIEW' })
    expect(rotaVoltarLista(s)).toBe('#/depoimentos?aba=GOOGLE_REVIEW')
  })

  it('sem rota guardada cai em "#/depoimentos"', () => {
    expect(rotaVoltarLista(storageFalso())).toBe('#/depoimentos')
  })

  it('valor adulterado (nao e rota de lista) cai no fallback', () => {
    const s = storageFalso({ [CHAVE_ULTIMA_LISTA]: '#/ficha/9' })
    expect(rotaVoltarLista(s)).toBe('#/depoimentos')
  })

  it('storage ausente ou que lanca cai no fallback', () => {
    expect(rotaVoltarLista(null)).toBe('#/depoimentos')
    expect(rotaVoltarLista({ getItem: () => { throw new Error('x') } })).toBe('#/depoimentos')
  })
})
