import { describe, it, expect } from 'vitest'
import {
  calcularDimensao, validarBlobComprimido, LARGURA_MAXIMA, ALTURA_MAXIMA_WEBP,
} from '../../src/lib/imagem.js'

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

  // WebP nao codifica mais de 16383 px por lado: um print de conversa
  // muito longo (1080 x 20000) estouraria o limite so pela altura.
  it('o limite de altura e o maximo do WebP, 16383', () => {
    expect(ALTURA_MAXIMA_WEBP).toBe(16383)
  })

  it('print muito alto e limitado pela altura, mantendo proporcao', () => {
    const r = calcularDimensao({ largura: 1080, altura: 20000 })
    expect(r.altura).toBeLessThanOrEqual(16383)
    expect(r.altura).toBe(16383)
    expect(Number.isInteger(r.largura)).toBe(true)
    expect(r.largura / r.altura).toBeCloseTo(1080 / 20000, 3)
  })

  it('largo e alto ao mesmo tempo usa a escala mais restritiva', () => {
    const r = calcularDimensao({ largura: 2560, altura: 40000 })
    expect(r.altura).toBeLessThanOrEqual(16383)
    expect(r.largura).toBeLessThanOrEqual(1280)
    expect(r.largura / r.altura).toBeCloseTo(2560 / 40000, 3)
  })

  it('altura exatamente no limite do WebP nao altera nada', () => {
    expect(calcularDimensao({ largura: 1000, altura: 16383 }))
      .toEqual({ largura: 1000, altura: 16383 })
  })
})

describe('validarBlobComprimido', () => {
  it('rejeita blob nulo com mensagem em pt-BR', () => {
    expect(() => validarBlobComprimido(null)).toThrow('Não foi possível comprimir a imagem.')
  })

  it('rejeita blob que nao seja webp com mensagem em pt-BR', () => {
    expect(() => validarBlobComprimido({ type: 'image/png' }))
      .toThrow('Este navegador não gera WebP (o Safari, por exemplo); use outro navegador.')
  })

  it('devolve o proprio blob quando o tipo e webp', () => {
    const blob = { type: 'image/webp' }
    expect(validarBlobComprimido(blob)).toBe(blob)
  })
})
