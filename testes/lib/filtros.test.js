import { describe, it, expect } from 'vitest'
import { montarFiltros, filtrosParaUrl, urlParaFiltros, ESTADO_VAZIO } from '../../src/lib/filtros.js'

describe('montarFiltros', () => {
  it('estado vazio vira objeto vazio', () => {
    expect(montarFiltros(ESTADO_VAZIO)).toEqual({})
  })

  it('omite listas vazias em vez de mandar array vazio', () => {
    expect(montarFiltros({ ...ESTADO_VAZIO, tipos: [] })).toEqual({})
  })

  it('a aba vira filtro de fonte', () => {
    expect(montarFiltros({ ...ESTADO_VAZIO, aba: 'GOOGLE_REVIEW' }))
      .toEqual({ fontes: ['GOOGLE_REVIEW'] })
  })

  it('a aba Todos nao filtra fonte', () => {
    expect(montarFiltros({ ...ESTADO_VAZIO, aba: 'TODOS' })).toEqual({})
  })

  it('separa condicoes de percentual das de TRI', () => {
    const estado = {
      ...ESTADO_VAZIO,
      notas: [
        { materia_id: 1, minimo: 100, familia: 'PERCENTUAL' },
        { materia_id: 2, minimo: 900, familia: 'TRI' },
      ],
    }
    expect(montarFiltros(estado)).toEqual({
      notas: [{ materia_id: 1, minimo: 100 }],
      tri: [{ materia_id: 2, minimo: 900 }],
    })
  })
})

describe('ida e volta pela URL', () => {
  it('preserva o estado', () => {
    const estado = {
      ...ESTADO_VAZIO,
      aba: 'GOOGLE_REVIEW',
      texto: 'ITA',
      tipos: ['APROVACAO'],
      instituicoes: [7],
      ano: 2025,
      notas: [{ materia_id: 1, minimo: 90, familia: 'PERCENTUAL' }],
    }
    expect(urlParaFiltros(filtrosParaUrl(estado))).toEqual(estado)
  })

  it('URL vazia devolve o estado vazio', () => {
    expect(urlParaFiltros('')).toEqual(ESTADO_VAZIO)
  })
})

// --- Emenda da Task 12: faixa de ano, operador, e montagem defensiva ---
// Ver .superpowers/sdd/2026-09-23-nucleo-depoimentos/task-12-brief.md e o
// contrato de p_filtros na Task 11 (docs/superpowers/plans/...).

describe('montarFiltros: faixa de ano (ano_de/ano_ate)', () => {
  it('emite ano_de e ano_ate quando presentes', () => {
    expect(montarFiltros({ ...ESTADO_VAZIO, anoDe: 2020, anoAte: 2025 }))
      .toEqual({ ano_de: 2020, ano_ate: 2025 })
  })

  it('ano_de e ano_ate sao independentes de ano', () => {
    expect(montarFiltros({ ...ESTADO_VAZIO, ano: 2025, anoDe: 2020 }))
      .toEqual({ ano: 2025, ano_de: 2020 })
  })
})

describe('montarFiltros: operador da condicao de nota', () => {
  it('passa operador "=" adiante para condicao de percentual', () => {
    const estado = {
      ...ESTADO_VAZIO,
      notas: [{ materia_id: 1, minimo: 100, familia: 'PERCENTUAL', operador: '=' }],
    }
    expect(montarFiltros(estado)).toEqual({
      notas: [{ materia_id: 1, minimo: 100, operador: '=' }],
    })
  })

  it('omite operador ">=" (e o padrao do banco)', () => {
    const estado = {
      ...ESTADO_VAZIO,
      notas: [{ materia_id: 1, minimo: 100, familia: 'PERCENTUAL', operador: '>=' }],
    }
    expect(montarFiltros(estado)).toEqual({
      notas: [{ materia_id: 1, minimo: 100 }],
    })
  })

  it('TRI nunca carrega operador, mesmo se vier no estado', () => {
    const estado = {
      ...ESTADO_VAZIO,
      notas: [{ materia_id: 2, minimo: 900, familia: 'TRI', operador: '=' }],
    }
    expect(montarFiltros(estado)).toEqual({
      tri: [{ materia_id: 2, minimo: 900 }],
    })
  })
})

describe('montarFiltros: montagem defensiva', () => {
  it('descarta condicao de nota sem minimo numerico', () => {
    const estado = { ...ESTADO_VAZIO, notas: [{ materia_id: 1, familia: 'PERCENTUAL' }] }
    expect(montarFiltros(estado)).toEqual({})
  })

  it('descarta condicao de tri sem materia_id numerico', () => {
    const estado = { ...ESTADO_VAZIO, notas: [{ minimo: 900, familia: 'TRI' }] }
    expect(montarFiltros(estado)).toEqual({})
  })

  it('nunca emite elemento null dentro de uma lista', () => {
    const estado = { ...ESTADO_VAZIO, instituicoes: [7, null, 8] }
    expect(montarFiltros(estado)).toEqual({ instituicoes: [7, 8] })
  })
})

describe('filtrosParaUrl / urlParaFiltros: faixa de ano e operador', () => {
  it('usa as chaves ano_de e ano_ate na URL', () => {
    const url = filtrosParaUrl({ ...ESTADO_VAZIO, anoDe: 2020, anoAte: 2025 })
    const params = new URLSearchParams(url)
    expect(params.get('ano_de')).toBe('2020')
    expect(params.get('ano_ate')).toBe('2025')
  })

  it('preserva anoDe/anoAte na ida e volta', () => {
    const estado = { ...ESTADO_VAZIO, anoDe: 2020, anoAte: 2025 }
    expect(urlParaFiltros(filtrosParaUrl(estado))).toEqual(estado)
  })

  it('preserva operador "=" na ida e volta', () => {
    const estado = {
      ...ESTADO_VAZIO,
      notas: [{ materia_id: 1, minimo: 90, familia: 'PERCENTUAL', operador: '=' }],
    }
    expect(urlParaFiltros(filtrosParaUrl(estado))).toEqual(estado)
  })

  it('item de 3 partes (sem operador) ainda e reconhecido, retrocompativel', () => {
    const estado = urlParaFiltros('notas=1:90:PERCENTUAL')
    expect(estado.notas).toEqual([{ materia_id: 1, minimo: 90, familia: 'PERCENTUAL' }])
  })

  it('quando operador esta ausente, nao aparece a chave no objeto', () => {
    const estado = urlParaFiltros('notas=1:90:PERCENTUAL')
    expect(Object.keys(estado.notas[0])).not.toContain('operador')
  })
})

describe('urlParaFiltros: entrada mal-formada (URL editada a mao)', () => {
  it('ano vazio vira null', () => {
    expect(urlParaFiltros('ano=').ano).toBeNull()
  })

  it('ano nao numerico vira null', () => {
    expect(urlParaFiltros('ano=abc').ano).toBeNull()
  })

  it('lista numerica descarta pedacos vazios e nao numericos', () => {
    expect(urlParaFiltros('instituicoes=1,,x').instituicoes).toEqual([1])
  })

  it('texto so com espacos vira ausente', () => {
    expect(urlParaFiltros('q=%20%20%20').texto).toBe('')
  })
})
