import { describe, it, expect } from 'vitest'
import {
  montarFiltros, filtrosParaUrl, urlParaFiltros, ESTADO_VAZIO, estadoVazio,
} from '../../src/lib/filtros.js'

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

// --- Fix round 1 (2026-09-24): segmento vazio em nota, operador invalido ---

describe('urlParaFiltros: segmento vazio em nota vira NaN, nao zero', () => {
  it('materia_id vazio descarta a condicao (nao vira 0)', () => {
    expect(urlParaFiltros('notas=:900:TRI').notas).toEqual([])
  })

  it('minimo vazio descarta a condicao (nao vira 0)', () => {
    expect(urlParaFiltros('notas=1::PERCENTUAL').notas).toEqual([])
  })

  it('materia_id so com espaco descarta a condicao', () => {
    expect(urlParaFiltros('notas= :90').notas).toEqual([])
  })
})

describe('filtrosParaUrl: nao serializa condicao invalida', () => {
  it('estado com materia_id invalido nao gera parametro notas', () => {
    const estado = { ...ESTADO_VAZIO, notas: [{ materia_id: NaN, minimo: 90, familia: 'PERCENTUAL' }] }
    expect(filtrosParaUrl(estado)).toBe('')
  })

  it('mistura de condicao valida e invalida so serializa a valida', () => {
    const estado = {
      ...ESTADO_VAZIO,
      notas: [
        { materia_id: 1, minimo: 90, familia: 'PERCENTUAL' },
        { materia_id: undefined, minimo: 900, familia: 'TRI' },
      ],
    }
    const params = new URLSearchParams(filtrosParaUrl(estado))
    expect(params.get('notas')).toBe('1:90:PERCENTUAL')
  })
})

describe('montarFiltros: operador invalido no estado e bug do chamador', () => {
  it('lanca erro com a causa quando operador nao e "=", ">=", nulo ou ausente', () => {
    const estado = { ...ESTADO_VAZIO, notas: [{ materia_id: 1, minimo: 90, familia: 'PERCENTUAL', operador: '!=' }] }
    expect(() => montarFiltros(estado)).toThrow(/operador invalido/)
  })

  it('operador undefined, null, "=" e ">=" nao lancam', () => {
    for (const operador of [undefined, null, '=', '>=']) {
      const estado = { ...ESTADO_VAZIO, notas: [{ materia_id: 1, minimo: 90, familia: 'PERCENTUAL', operador }] }
      expect(() => montarFiltros(estado)).not.toThrow()
    }
  })
})

describe('urlParaFiltros: 4o segmento desconhecido e descartado, nao rejeitado', () => {
  it('operador invalido na URL editada a mao descarta so o operador, mantem a condicao', () => {
    const estado = urlParaFiltros('notas=1:90:PERCENTUAL:diferente')
    expect(estado.notas).toEqual([{ materia_id: 1, minimo: 90, familia: 'PERCENTUAL' }])
  })
})

describe('texto com caracteres especiais preserva ida e volta', () => {
  it('virgula, dois-pontos e "&" sobrevivem ao round-trip', () => {
    const estado = { ...ESTADO_VAZIO, texto: 'a,b:c&d' }
    expect(urlParaFiltros(filtrosParaUrl(estado))).toEqual(estado)
  })
})

// --- Fix round 2 (Marco 2, 2026-09-24): URL editada a mao ainda derruba a
// busca. Ver .superpowers/sdd/2026-09-23-nucleo-depoimentos/marco-2-fix-brief.md
// item 1. Probes da revisao: instituicoes=1.5, notas=1.5:90:PERCENTUAL,
// provas=1e30, ano=99999, ano_de=-40000 derrubavam buscar_depoimentos com
// erro de banco (bigint/smallint) em vez de tratar como ausente.

describe('urlParaFiltros: ids de lista exigem inteiro seguro e positivo', () => {
  it('instituicoes=1.5 (decimal) e descartado, nao vira erro de bigint', () => {
    expect(urlParaFiltros('instituicoes=1.5').instituicoes).toEqual([])
  })

  it('provas=1e30 (fora da faixa segura de inteiro) e descartado', () => {
    expect(urlParaFiltros('provas=1e30').provas).toEqual([])
  })

  it('cursos=-3 (nao positivo) e descartado', () => {
    expect(urlParaFiltros('cursos=-3').cursos).toEqual([])
  })

  it('cursos=0 (nao positivo) e descartado', () => {
    expect(urlParaFiltros('cursos=0').cursos).toEqual([])
  })

  it('id valido misturado com invalido preserva so o valido', () => {
    expect(urlParaFiltros('instituicoes=1.5,7,-3,8').instituicoes).toEqual([7, 8])
  })
})

describe('urlParaFiltros: ano/ano_de/ano_ate exigem a faixa de ck_ano (1990-2100)', () => {
  it('ano=99999 (fora da faixa de smallint) vira null', () => {
    expect(urlParaFiltros('ano=99999').ano).toBeNull()
  })

  it('ano_de=-40000 (fora da faixa de smallint) vira null', () => {
    expect(urlParaFiltros('ano_de=-40000').anoDe).toBeNull()
  })

  it('ano=1989 (abaixo do minimo de ck_ano) vira null', () => {
    expect(urlParaFiltros('ano=1989').ano).toBeNull()
  })

  it('ano=2101 (acima do maximo de ck_ano) vira null', () => {
    expect(urlParaFiltros('ano=2101').ano).toBeNull()
  })

  it('ano=1990 (limite minimo de ck_ano) e aceito', () => {
    expect(urlParaFiltros('ano=1990').ano).toBe(1990)
  })

  it('ano=2100 (limite maximo de ck_ano) e aceito', () => {
    expect(urlParaFiltros('ano=2100').ano).toBe(2100)
  })
})

describe('urlParaFiltros: notas com materia_id decimal e descartada (evitava erro de bigint)', () => {
  it('notas=1.5:90:PERCENTUAL descarta a condicao inteira', () => {
    expect(urlParaFiltros('notas=1.5:90:PERCENTUAL').notas).toEqual([])
  })
})

describe('urlParaFiltros: familia desconhecida descarta a condicao', () => {
  it('notas=1:90:FOO nao vira condicao de percentual por engano', () => {
    expect(urlParaFiltros('notas=1:90:FOO').notas).toEqual([])
  })
})

describe('urlParaFiltros: print so aceita "true"/"false" literal', () => {
  it('print=sim (lixo) vira null, nao false', () => {
    expect(urlParaFiltros('print=sim').temPrint).toBeNull()
  })

  it('print=true vira true', () => {
    expect(urlParaFiltros('print=true').temPrint).toBe(true)
  })

  it('print=false vira false', () => {
    expect(urlParaFiltros('print=false').temPrint).toBe(false)
  })

  it('print ausente vira null', () => {
    expect(urlParaFiltros('').temPrint).toBeNull()
  })
})

describe('montarFiltros: mesma coercao/validacao numerica se aplica ao estado (defesa em profundidade)', () => {
  it('id nao inteiro/nao positivo na lista e descartado mesmo vindo do estado', () => {
    expect(montarFiltros({ ...ESTADO_VAZIO, instituicoes: [1.5, -3, 0, 8] }))
      .toEqual({ instituicoes: [8] })
  })

  it('ano fora da faixa 1990-2100 e descartado mesmo vindo do estado', () => {
    expect(montarFiltros({ ...ESTADO_VAZIO, ano: 99999 })).toEqual({})
  })

  it('materia_id nao inteiro na condicao de nota e descartado (evitava erro de bigint)', () => {
    const estado = { ...ESTADO_VAZIO, notas: [{ materia_id: 1.5, minimo: 90, familia: 'PERCENTUAL' }] }
    expect(montarFiltros(estado)).toEqual({})
  })

  it('familia desconhecida na condicao de nota e descartada mesmo vindo do estado', () => {
    const estado = { ...ESTADO_VAZIO, notas: [{ materia_id: 1, minimo: 90, familia: 'FOO' }] }
    expect(montarFiltros(estado)).toEqual({})
  })

  it('minimo aceita decimal', () => {
    const estado = { ...ESTADO_VAZIO, notas: [{ materia_id: 1, minimo: 92.5, familia: 'PERCENTUAL' }] }
    expect(montarFiltros(estado)).toEqual({ notas: [{ materia_id: 1, minimo: 92.5 }] })
  })
})

describe('montarFiltros: coercao central de string vinda de formulario', () => {
  it('ids de lista em string sao coeridos para numero', () => {
    expect(montarFiltros({ ...ESTADO_VAZIO, instituicoes: ['7', '8'] }))
      .toEqual({ instituicoes: [7, 8] })
  })

  it('materia_id e minimo em string sao coeridos para numero', () => {
    const estado = { ...ESTADO_VAZIO, notas: [{ materia_id: '1', minimo: '90', familia: 'PERCENTUAL' }] }
    expect(montarFiltros(estado)).toEqual({ notas: [{ materia_id: 1, minimo: 90 }] })
  })

  it('ano em string e coerido e validado pela faixa', () => {
    expect(montarFiltros({ ...ESTADO_VAZIO, ano: '2025' })).toEqual({ ano: 2025 })
  })

  it('string so com espaco em id de lista e descartada, nao vira 0', () => {
    expect(montarFiltros({ ...ESTADO_VAZIO, instituicoes: ['  ', '7'] }))
      .toEqual({ instituicoes: [7] })
  })
})

// Achado durante o item 3 do brief (teste de contrato lib->SQL em
// testes/rls/busca_multicondicao.test.js): materia_id/minimo vindos do
// Postgres via `pg` chegam como STRING (bigint nao vira number sozinho no
// driver), nao como number. filtrosParaUrl checava a condicao SEM coagir
// primeiro — uma condicao valida com materia_id string era descartada em
// silencio, e a URL saia sem o parametro "notas".
describe('filtrosParaUrl: coage materia_id/minimo (string) antes de validar', () => {
  it('materia_id e minimo em string ainda geram o parametro notas', () => {
    const estado = {
      ...ESTADO_VAZIO,
      notas: [{ materia_id: '1', minimo: '100', familia: 'PERCENTUAL', operador: '=' }],
    }
    const params = new URLSearchParams(filtrosParaUrl(estado))
    expect(params.get('notas')).toBe('1:100:PERCENTUAL:=')
  })

  it('ida e volta com materia_id/minimo em string preserva a condicao', () => {
    const estado = {
      ...ESTADO_VAZIO,
      notas: [{ materia_id: '1', minimo: '100', familia: 'PERCENTUAL', operador: '=' }],
    }
    expect(urlParaFiltros(filtrosParaUrl(estado)).notas)
      .toEqual([{ materia_id: 1, minimo: 100, familia: 'PERCENTUAL', operador: '=' }])
  })
})

// --- Item 2 do brief: ESTADO_VAZIO nao pode compartilhar arrays entre
// copias, e a UI precisa de uma copia nova e mutavel para limpar filtros.

describe('estadoVazio() / ESTADO_VAZIO: nao compartilham arrays', () => {
  it('mutar a copia de estadoVazio() nao afeta ESTADO_VAZIO', () => {
    const copia = estadoVazio()
    copia.tipos.push('X')
    expect(ESTADO_VAZIO.tipos).toEqual([])
  })

  it('estadoVazio() devolve um objeto igual a ESTADO_VAZIO', () => {
    expect(estadoVazio()).toEqual(ESTADO_VAZIO)
  })

  it('tentar mutar ESTADO_VAZIO.tipos lanca (modo estrito do ESM)', () => {
    expect(() => ESTADO_VAZIO.tipos.push('X')).toThrow()
  })

  it('tentar mutar ESTADO_VAZIO.notas lanca', () => {
    expect(() => ESTADO_VAZIO.notas.push({})).toThrow()
  })

  it('tentar reatribuir um campo de ESTADO_VAZIO lanca', () => {
    expect(() => { ESTADO_VAZIO.aba = 'GOOGLE_REVIEW' }).toThrow()
  })
})

// --- Item 3 do brief (parte lib): canal isolado e uma combinacao ampla —
// spec §8 (docs/superpowers/specs/2026-09-23-nucleo-depoimentos-design.md)
// cita "canal, combinações" entre os casos de montagem do filtro.

describe('montarFiltros: canal', () => {
  it('emite canais quando presente', () => {
    expect(montarFiltros({ ...ESTADO_VAZIO, canais: ['MILITARES'] }))
      .toEqual({ canais: ['MILITARES'] })
  })

  it('omite canais quando vazio', () => {
    expect(montarFiltros({ ...ESTADO_VAZIO, canais: [] })).toEqual({})
  })
})

describe('montarFiltros: combinacao ampla de campos', () => {
  it('monta todos os campos juntos, cada um na sua chave', () => {
    const estado = {
      ...ESTADO_VAZIO,
      aba: 'GOOGLE_REVIEW',
      texto: 'ITA',
      tipos: ['APROVACAO'],
      canais: ['MILITARES'],
      status: ['DISPONIVEL'],
      instituicoes: [7],
      provas: [3],
      cursos: [4],
      ano: 2025,
      anoDe: 2020,
      anoAte: 2025,
      notas: [
        { materia_id: 1, minimo: 100, familia: 'PERCENTUAL', operador: '=' },
        { materia_id: 2, minimo: 900, familia: 'TRI' },
      ],
      temPrint: true,
    }
    expect(montarFiltros(estado)).toEqual({
      fontes: ['GOOGLE_REVIEW'],
      texto: 'ITA',
      tipos: ['APROVACAO'],
      canais: ['MILITARES'],
      status: ['DISPONIVEL'],
      instituicoes: [7],
      provas: [3],
      cursos: [4],
      ano: 2025,
      ano_de: 2020,
      ano_ate: 2025,
      notas: [{ materia_id: 1, minimo: 100, operador: '=' }],
      tri: [{ materia_id: 2, minimo: 900 }],
      tem_print: true,
    })
  })

  it('a mesma combinacao sobrevive a ida e volta pela URL', () => {
    const estado = {
      ...ESTADO_VAZIO,
      aba: 'GOOGLE_REVIEW',
      texto: 'ITA',
      tipos: ['APROVACAO'],
      canais: ['MILITARES'],
      status: ['DISPONIVEL'],
      instituicoes: [7],
      provas: [3],
      cursos: [4],
      anoDe: 2020,
      anoAte: 2025,
      notas: [{ materia_id: 1, minimo: 100, familia: 'PERCENTUAL', operador: '=' }],
      temPrint: true,
    }
    expect(urlParaFiltros(filtrosParaUrl(estado))).toEqual(estado)
  })
})

// --- Task 21 (emenda 2026-09-24): "Tem link original?" ---
// Mesmo tratamento de temPrint. Decisao do controlador: a URL segue a
// convencao ja existente de `print` (true/false literal), nao sim/nao —
// uma convencao so; o texto do plano foi emendado.
describe('temLinkOriginal: estado, p_filtros e URL', () => {
  it('estado vazio tem temLinkOriginal null', () => {
    expect(estadoVazio().temLinkOriginal).toBeNull()
    expect(ESTADO_VAZIO.temLinkOriginal).toBeNull()
  })

  it('null nao emite tem_link_original', () => {
    expect(montarFiltros({ ...ESTADO_VAZIO, temLinkOriginal: null })).toEqual({})
  })

  it('true e false viram tem_link_original boolean', () => {
    expect(montarFiltros({ ...ESTADO_VAZIO, temLinkOriginal: true }))
      .toEqual({ tem_link_original: true })
    expect(montarFiltros({ ...ESTADO_VAZIO, temLinkOriginal: false }))
      .toEqual({ tem_link_original: false })
  })

  it('URL usa a chave link com true/false', () => {
    expect(filtrosParaUrl({ ...ESTADO_VAZIO, temLinkOriginal: true })).toBe('link=true')
    expect(filtrosParaUrl({ ...ESTADO_VAZIO, temLinkOriginal: false })).toBe('link=false')
    expect(filtrosParaUrl({ ...ESTADO_VAZIO, temLinkOriginal: null })).toBe('')
  })

  it('urlParaFiltros: so "true"/"false" literal; lixo (inclusive sim/nao) vira null', () => {
    expect(urlParaFiltros('link=true').temLinkOriginal).toBe(true)
    expect(urlParaFiltros('link=false').temLinkOriginal).toBe(false)
    expect(urlParaFiltros('link=sim').temLinkOriginal).toBeNull()
    expect(urlParaFiltros('link=nao').temLinkOriginal).toBeNull()
    expect(urlParaFiltros('').temLinkOriginal).toBeNull()
  })

  it('ida e volta preserva temLinkOriginal junto com temPrint', () => {
    for (const temLinkOriginal of [true, false, null]) {
      const estado = { ...ESTADO_VAZIO, temPrint: false, temLinkOriginal }
      expect(urlParaFiltros(filtrosParaUrl(estado))).toEqual(estado)
    }
  })
})
