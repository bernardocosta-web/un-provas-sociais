import { describe, it, expect } from 'vitest'
import {
  validarDepoimento, LIMITE_AVISO_RESUMO, VALOR_NOTA_MAXIMO,
} from '../../src/lib/validacao.js'

const BASE = {
  texto_completo: 'Passei no ITA',
  fonte: 'MANUAL',
  autorizacao_publicacao: 'NAO_INFORMADO',
  status_uso: 'DISPONIVEL',
  participacoes: [],
}

describe('validarDepoimento', () => {
  it('ficha minima e valida', () => {
    expect(validarDepoimento(BASE)).toEqual([])
  })

  it('texto vazio e erro', () => {
    expect(validarDepoimento({ ...BASE, texto_completo: '  ' }))
      .toContain('O texto completo é obrigatório.')
  })

  it('PONTOS sem maximo e erro', () => {
    const ficha = { ...BASE, participacoes: [{ prova_id: 1, ano: 2025,
      notas: [{ materia_id: 1, valor_original: 18, escala: 'PONTOS' }], resultados: [] }] }
    expect(validarDepoimento(ficha))
      .toContain('Nota em pontos precisa do valor máximo.')
  })

  it('aprovado sem instituicao e erro', () => {
    const ficha = { ...BASE, participacoes: [{ prova_id: 1, ano: 2025, notas: [],
      resultados: [{ situacao: 'APROVADO', instituicao_id: null }] }] }
    expect(validarDepoimento(ficha))
      .toContain('Resultado aprovado precisa de instituição.')
  })

  it('NAO_AUTORIZADO fora de DESCARTADO e erro', () => {
    expect(validarDepoimento({ ...BASE, autorizacao_publicacao: 'NAO_AUTORIZADO' }))
      .toContain('Depoimento sem autorização só pode ficar descartado por falta de autorização.')
  })

  it('POSTADO sem data e erro', () => {
    expect(validarDepoimento({ ...BASE, status_uso: 'POSTADO' }))
      .toContain('Depoimento postado precisa da data da postagem.')
  })

  it('POSTADO sem link NAO e erro', () => {
    expect(validarDepoimento({ ...BASE, status_uso: 'POSTADO', data_postagem: '2026-09-01' }))
      .toEqual([])
  })

  it('resumo longo nao e erro — o aviso e visual', () => {
    const longo = 'a'.repeat(LIMITE_AVISO_RESUMO + 50)
    expect(validarDepoimento({ ...BASE, resumo_curto: longo })).toEqual([])
  })

  // Emenda pos-aprovacao (Marco 2, 2026-09-24): espelho das constraints de
  // nota do banco (ck_nota_nao_negativa, ck_percentual_ate_100,
  // ck_pontos_exige_maximo, ck_pontos_ate_maximo, ck_tri_faixa).
  it('nota sem valor e erro', () => {
    const ficha = { ...BASE, participacoes: [{ prova_id: 1, ano: 2025,
      notas: [{ materia_id: 1, escala: 'PERCENTUAL' }], resultados: [] }] }
    expect(validarDepoimento(ficha)).toContain('Toda nota precisa de um valor.')
  })

  it('nota negativa e erro', () => {
    const ficha = { ...BASE, participacoes: [{ prova_id: 1, ano: 2025,
      notas: [{ materia_id: 1, valor_original: -1, escala: 'PERCENTUAL' }], resultados: [] }] }
    expect(validarDepoimento(ficha)).toContain('O valor da nota não pode ser negativo.')
  })

  it('percentual acima de 100 e erro', () => {
    const ficha = { ...BASE, participacoes: [{ prova_id: 1, ano: 2025,
      notas: [{ materia_id: 1, valor_original: 101, escala: 'PERCENTUAL' }], resultados: [] }] }
    expect(validarDepoimento(ficha)).toContain('Nota em percentual não pode passar de 100.')
  })

  it('pontos acima do maximo e erro', () => {
    const ficha = { ...BASE, participacoes: [{ prova_id: 1, ano: 2025,
      notas: [{ materia_id: 1, valor_original: 21, valor_maximo: 20, escala: 'PONTOS' }],
      resultados: [] }] }
    expect(validarDepoimento(ficha)).toContain('Nota em pontos não pode passar do valor máximo.')
  })

  it('tri fora da faixa 0-1000 e erro', () => {
    const ficha = { ...BASE, participacoes: [{ prova_id: 1, ano: 2025,
      notas: [{ materia_id: 1, valor_original: 1001, escala: 'TRI' }], resultados: [] }] }
    expect(validarDepoimento(ficha)).toContain('Nota do TRI precisa estar entre 0 e 1000.')
  })

  // Mirrors adicionais (ck_descarte_motivo e ck_descarte_observacao nos dois
  // sentidos, ck_ano, escala/situacao NOT NULL) pedidos junto com a coercao
  // numerica de valores de formulario.
  it('motivo de descarte fora de DESCARTADO e erro', () => {
    expect(validarDepoimento({ ...BASE, motivo_descarte: 'QUALIDADE_BAIXA' }))
      .toContain('Motivo de descarte só vale para depoimento descartado.')
  })

  it('observacao de descarte fora de DESCARTADO e erro', () => {
    expect(validarDepoimento({ ...BASE, observacao_descarte: 'nota interna' }))
      .toContain('Observação de descarte só vale para depoimento descartado.')
  })

  // Fix round 1 (2026-09-24): '' é exatamente o que uma textarea limpa
  // manda — texto em branco conta como ausente, nunca como erro do
  // usuário. Quem normaliza '' para NULL de verdade é salvar_depoimento
  // (Task 19), não o validador.
  it('observacao de descarte em branco (vazia ou so espacos) nao e erro', () => {
    expect(validarDepoimento({ ...BASE, observacao_descarte: '' })).toEqual([])
    expect(validarDepoimento({ ...BASE, observacao_descarte: '   ' })).toEqual([])
  })

  it('ano fora do intervalo 1990-2100 e erro', () => {
    const ficha = { ...BASE, participacoes: [{ prova_id: 1, ano: 1800,
      notas: [], resultados: [] }] }
    expect(validarDepoimento(ficha))
      .toContain('O ano da participação precisa estar entre 1990 e 2100.')
  })

  it('ano nos limites 1990 e 2100 e valido', () => {
    const ficha1990 = { ...BASE, participacoes: [{ prova_id: 1, ano: 1990,
      notas: [], resultados: [] }] }
    const ficha2100 = { ...BASE, participacoes: [{ prova_id: 1, ano: 2100,
      notas: [], resultados: [] }] }
    expect(validarDepoimento(ficha1990)).toEqual([])
    expect(validarDepoimento(ficha2100)).toEqual([])
  })

  it('ano imediatamente fora dos limites (1989, 2101) e erro', () => {
    const ficha1989 = { ...BASE, participacoes: [{ prova_id: 1, ano: 1989,
      notas: [], resultados: [] }] }
    const ficha2101 = { ...BASE, participacoes: [{ prova_id: 1, ano: 2101,
      notas: [], resultados: [] }] }
    expect(validarDepoimento(ficha1989))
      .toContain('O ano da participação precisa estar entre 1990 e 2100.')
    expect(validarDepoimento(ficha2101))
      .toContain('O ano da participação precisa estar entre 1990 e 2100.')
  })

  it('nota sem escala e erro', () => {
    const ficha = { ...BASE, participacoes: [{ prova_id: 1, ano: 2025,
      notas: [{ materia_id: 1, valor_original: 10 }], resultados: [] }] }
    expect(validarDepoimento(ficha)).toContain('Toda nota precisa de escala.')
  })

  it('resultado sem situacao e erro', () => {
    const ficha = { ...BASE, participacoes: [{ prova_id: 1, ano: 2025,
      notas: [], resultados: [{ instituicao_id: 1 }] }] }
    expect(validarDepoimento(ficha)).toContain('Todo resultado precisa de situação.')
  })

  // Valores de formulario chegam como string ('18', ' 20 ', '') — a
  // comparacao lexica ('9' > '20') derrubaria estes casos sem coercao.
  it('PONTOS com valores string dentro do maximo e valido', () => {
    const ficha = { ...BASE, participacoes: [{ prova_id: 1, ano: 2025,
      notas: [{ materia_id: 1, valor_original: '9', valor_maximo: '20', escala: 'PONTOS' }],
      resultados: [] }] }
    expect(validarDepoimento(ficha)).toEqual([])
  })

  it('PONTOS com valor string acima do maximo e erro', () => {
    const ficha = { ...BASE, participacoes: [{ prova_id: 1, ano: 2025,
      notas: [{ materia_id: 1, valor_original: '21', valor_maximo: '20', escala: 'PONTOS' }],
      resultados: [] }] }
    expect(validarDepoimento(ficha)).toContain('Nota em pontos não pode passar do valor máximo.')
  })

  it('valor string vazio e erro de "precisa de um valor"', () => {
    const ficha = { ...BASE, participacoes: [{ prova_id: 1, ano: 2025,
      notas: [{ materia_id: 1, valor_original: '', escala: 'PERCENTUAL' }], resultados: [] }] }
    expect(validarDepoimento(ficha)).toContain('Toda nota precisa de um valor.')
  })

  it('ano como string valida e sem erro', () => {
    const ficha = { ...BASE, participacoes: [{ prova_id: 1, ano: '2025',
      notas: [], resultados: [] }] }
    expect(validarDepoimento(ficha)).toEqual([])
  })

  // Revisao conjunta (2026-09-24): participacao.ano e integer — '2020.5'
  // chegaria ao banco e seria recusado com erro cru.
  it('ano decimal e erro de inteiro', () => {
    const ficha = { ...BASE, participacoes: [{ prova_id: 1, ano: '2020.5',
      notas: [], resultados: [] }] }
    expect(validarDepoimento(ficha))
      .toContain('O ano da participação precisa ser um número inteiro.')
  })

  // valor_original e valor_maximo sao numeric(8,2): acima de 999999.99 o
  // banco recusa com "numeric field overflow".
  it('o teto de valor de nota e o de numeric(8,2)', () => {
    expect(VALOR_NOTA_MAXIMO).toBe(999999.99)
  })

  it('valor_original acima de 999999.99 e erro', () => {
    const ficha = { ...BASE, participacoes: [{ prova_id: 1, ano: 2025,
      notas: [{ materia_id: 1, valor_original: '1000000', valor_maximo: '2000000',
        escala: 'PONTOS' }], resultados: [] }] }
    expect(validarDepoimento(ficha))
      .toContain('O valor da nota não pode passar de 999999,99.')
  })

  it('valor_maximo acima de 999999.99 e erro', () => {
    const ficha = { ...BASE, participacoes: [{ prova_id: 1, ano: 2025,
      notas: [{ materia_id: 1, valor_original: 10, valor_maximo: 1000000,
        escala: 'PONTOS' }], resultados: [] }] }
    expect(validarDepoimento(ficha))
      .toContain('O valor máximo da nota não pode passar de 999999,99.')
  })

  it('valores exatamente em 999999.99 sao validos', () => {
    const ficha = { ...BASE, participacoes: [{ prova_id: 1, ano: 2025,
      notas: [{ materia_id: 1, valor_original: '999999.99', valor_maximo: '999999.99',
        escala: 'PONTOS' }], resultados: [] }] }
    expect(validarDepoimento(ficha)).toEqual([])
  })
})
