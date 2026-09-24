import { describe, it, expect } from 'vitest'
import { calcularDimensao, validarBlobComprimido, LARGURA_MAXIMA } from '../../src/lib/imagem.js'

describe('calcularDimensao', () => {
  it('nao amplia imagem menor que o limite', () => {
    expect(calcularDimensao({ largura: 800, altura: 600 })).toEqual({ largura: 800, altura: 600 })
  })

  it('reduz mantendo proporcao', () => {
    expect(calcularDimensao({ largura: 2560, altura: 1440 }))
      .toEqual({ largura: 1280, altura: 720 })
  })

  it('arredonda a altura para inteiro', () => {
    const r = calcularDimensao({ largura: 1920, altura: 1081 })
    expect(Number.isInteger(r.altura)).toBe(true)
  })

  it('o limite e 1280, acima dos 1080 do carrossel', () => {
    expect(LARGURA_MAXIMA).toBe(1280)
  })

  it('print retrato alto reduz pela largura, nao pela altura', () => {
    expect(calcularDimensao({ largura: 1440, altura: 3200 }).largura).toBe(1280)
  })

  it('na largura exata do limite nao altera nada', () => {
    expect(calcularDimensao({ largura: 1280, altura: 900 })).toEqual({ largura: 1280, altura: 900 })
  })

  it('aceita larguraMaxima customizada', () => {
    expect(calcularDimensao({ largura: 1000, altura: 500 }, 400))
      .toEqual({ largura: 400, altura: 200 })
  })

  it('respeita larguraMaxima customizada quando a imagem ja e menor', () => {
    expect(calcularDimensao({ largura: 300, altura: 200 }, 400))
      .toEqual({ largura: 300, altura: 200 })
  })
})

describe('validarBlobComprimido', () => {
  it('rejeita blob nulo com mensagem em pt-BR', () => {
    expect(() => validarBlobComprimido(null)).toThrow('Não foi possível comprimir a imagem.')
  })

  it('rejeita blob que nao seja webp com mensagem em pt-BR', () => {
    expect(() => validarBlobComprimido({ type: 'image/png' }))
      .toThrow('Este navegador não gera WebP; use o Chrome ou o Edge.')
  })

  it('devolve o proprio blob quando o tipo e webp', () => {
    const blob = { type: 'image/webp' }
    expect(validarBlobComprimido(blob)).toBe(blob)
  })
})
