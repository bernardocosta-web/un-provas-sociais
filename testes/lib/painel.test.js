import { describe, it, expect } from 'vitest'
import {
  alternar, PRESETS_PERCENTUAL, condicaoPercentual, condicaoTri, descreverCondicao,
  removerCondicao, booleanoParaCampo, campoParaBooleano, limparFiltros,
} from '../../src/lib/painel.js'
import { ESTADO_VAZIO, estadoVazio, filtrosParaUrl, urlParaFiltros } from '../../src/lib/filtros.js'

describe('alternar', () => {
  it('poe e tira um valor sem mutar a lista original', () => {
    const original = ['A']
    expect(alternar(original, 'B')).toEqual(['A', 'B'])
    expect(alternar(original, 'A')).toEqual([])
    expect(original).toEqual(['A'])
  })
  it('lista ausente conta como vazia', () => {
    expect(alternar(undefined, 'A')).toEqual(['A'])
  })
})

describe('condicaoPercentual (percentual e TRI sao familias separadas)', () => {
  it('presets da spec: = 100%, >= 90%, >= 70% e livre', () => {
    expect(PRESETS_PERCENTUAL.map((p) => p.chave)).toEqual(['=100', '>=90', '>=70', 'livre'])
  })

  it('= 100% vira operador "=" e minimo 100', () => {
    expect(condicaoPercentual({ materia: '3', preset: '=100' }))
      .toEqual({ materia_id: 3, minimo: 100, familia: 'PERCENTUAL', operador: '=' })
  })

  it('>= 90% vira operador ">="', () => {
    expect(condicaoPercentual({ materia: 3, preset: '>=90' }))
      .toEqual({ materia_id: 3, minimo: 90, familia: 'PERCENTUAL', operador: '>=' })
  })

  it('livre usa operador e valor digitados', () => {
    expect(condicaoPercentual({ materia: 3, preset: 'livre', operador: '=', minimo: '85' }))
      .toEqual({ materia_id: 3, minimo: 85, familia: 'PERCENTUAL', operador: '=' })
  })

  it('sem materia, preset desconhecido ou livre fora de 0-100 nao monta', () => {
    expect(condicaoPercentual({ materia: '', preset: '=100' })).toBeNull()
    expect(condicaoPercentual({ materia: 3, preset: 'lixo' })).toBeNull()
    expect(condicaoPercentual({ materia: 3, preset: 'livre', operador: '>=', minimo: '' })).toBeNull()
    expect(condicaoPercentual({ materia: 3, preset: 'livre', operador: '>=', minimo: 101 })).toBeNull()
    expect(condicaoPercentual({ materia: 3, preset: 'livre', operador: '<', minimo: 50 })).toBeNull()
  })

  it('a condicao montada sobrevive a ida e volta pela URL', () => {
    const notas = [condicaoPercentual({ materia: 3, preset: '>=70' })]
    const estado = { ...ESTADO_VAZIO, notas }
    expect(urlParaFiltros(filtrosParaUrl(estado)).notas).toEqual(notas)
  })
})

describe('condicaoTri', () => {
  it('materia + pontuacao minima, sem operador', () => {
    expect(condicaoTri({ materia: '2', minimo: '700' }))
      .toEqual({ materia_id: 2, minimo: 700, familia: 'TRI' })
  })
  it('fora de 0-1000 ou sem materia nao monta', () => {
    expect(condicaoTri({ materia: 2, minimo: 1001 })).toBeNull()
    expect(condicaoTri({ materia: 2, minimo: '' })).toBeNull()
    expect(condicaoTri({ materia: null, minimo: 700 })).toBeNull()
  })
})

describe('descreverCondicao', () => {
  const materias = [{ id: 1, nome: 'Física' }]
  it('percentual e TRI se distinguem no texto', () => {
    expect(descreverCondicao({ materia_id: 1, minimo: 100, familia: 'PERCENTUAL', operador: '=' }, materias))
      .toBe('Física = 100%')
    expect(descreverCondicao({ materia_id: 1, minimo: 90, familia: 'PERCENTUAL' }, materias))
      .toBe('Física ≥ 90%')
    expect(descreverCondicao({ materia_id: 1, minimo: 700, familia: 'TRI' }, materias))
      .toBe('Física (TRI) ≥ 700')
  })
  it('materia desconhecida mostra o id', () => {
    expect(descreverCondicao({ materia_id: 9, minimo: 70, familia: 'PERCENTUAL' }, materias))
      .toBe('Matéria #9 ≥ 70%')
  })
})

describe('removerCondicao', () => {
  it('tira pelo indice, sem mutar', () => {
    const notas = [{ a: 1 }, { a: 2 }, { a: 3 }]
    expect(removerCondicao(notas, 1)).toEqual([{ a: 1 }, { a: 3 }])
    expect(notas).toHaveLength(3)
  })
})

describe('booleanoParaCampo / campoParaBooleano (Tem print? Tem link original?)', () => {
  it('null <-> "", true <-> "true", false <-> "false"', () => {
    for (const [b, c] of [[null, ''], [true, 'true'], [false, 'false']]) {
      expect(booleanoParaCampo(b)).toBe(c)
      expect(campoParaBooleano(c)).toBe(b)
    }
  })
})

describe('limparFiltros', () => {
  it('zera todos os filtros do painel mas mantem a aba (a aba nao e controle do painel)', () => {
    const sujo = { ...estadoVazio(), aba: 'MANUAL', texto: 'x', tipos: ['ELOGIO'], temLinkOriginal: true }
    expect(limparFiltros(sujo)).toEqual({ ...estadoVazio(), aba: 'MANUAL' })
  })
  it('devolve arrays novos e mutaveis (estadoVazio(), nunca ESTADO_VAZIO)', () => {
    const limpo = limparFiltros(ESTADO_VAZIO)
    limpo.tipos.push('X')
    expect(ESTADO_VAZIO.tipos).toEqual([])
  })
})
