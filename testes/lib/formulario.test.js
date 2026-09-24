import { describe, it, expect } from 'vitest'
import {
  escalaPadrao, aplicarProva, novaFicha, novaParticipacao, novaNota, novoResultado,
  mudarAutorizacao, mudarStatus, podeEditar, comChaves,
} from '../../src/lib/formulario.js'
import { validarDepoimento } from '../../src/lib/validacao.js'

const ENEM = { id: 1, nome: 'ENEM' }
const FUVEST = { id: 2, nome: 'Fuvest' }

describe('escalaPadrao', () => {
  it('ENEM vem TRI, sem depender de caixa ou espaco', () => {
    expect(escalaPadrao(ENEM)).toBe('TRI')
    expect(escalaPadrao({ id: 1, nome: ' enem ' })).toBe('TRI')
  })
  it('outra prova vem PERCENTUAL', () => expect(escalaPadrao(FUVEST)).toBe('PERCENTUAL'))
  it('sem prova, sem escala', () => expect(escalaPadrao(null)).toBe(''))
})

describe('aplicarProva', () => {
  it('grava a prova e preenche so a escala que falta', () => {
    const participacao = {
      prova_id: '', ano: '', resultados: [],
      notas: [{ escala: '' }, { escala: 'PONTOS' }],
    }
    aplicarProva(participacao, ENEM)
    expect(participacao.prova_id).toBe(1)
    expect(participacao.notas.map((n) => n.escala)).toEqual(['TRI', 'PONTOS'])
  })
  it('prova limpa zera o id sem mexer nas escalas', () => {
    const participacao = { prova_id: 1, notas: [{ escala: 'TRI' }], resultados: [] }
    aplicarProva(participacao, null)
    expect(participacao.prova_id).toBe('')
    expect(participacao.notas[0].escala).toBe('TRI')
  })
})

describe('fabricas', () => {
  it('ficha nova nao tem id (insere) e usa os defaults do banco', () => {
    const ficha = novaFicha()
    expect('id' in ficha).toBe(false)
    expect(ficha.autorizacao_publicacao).toBe('NAO_INFORMADO')
    expect(ficha.status_uso).toBe('DISPONIVEL')
    expect(ficha.participacoes).toEqual([])
  })
  it('ficha nova com texto e fonte e valida', () => {
    const ficha = { ...novaFicha(), texto_completo: 'Passei!', fonte: 'MANUAL' }
    expect(validarDepoimento(ficha)).toEqual([])
  })
  it('cada chamada devolve objetos novos', () => {
    expect(novaFicha().tipos).not.toBe(novaFicha().tipos)
    expect(novaParticipacao().notas).not.toBe(novaParticipacao().notas)
  })
  it('nota nova ja vem com a escala padrao da prova', () => {
    expect(novaNota(ENEM).escala).toBe('TRI')
    expect(novaNota(null).escala).toBe('')
  })
  it('resultado novo em branco', () => {
    expect(novoResultado()).toMatchObject({ instituicao_id: '', curso_id: '', situacao: '' })
  })
})

describe('mudarAutorizacao', () => {
  it('NAO_AUTORIZADO descarta por falta de autorizacao na mesma operacao', () => {
    const ficha = { ...novaFicha(), texto_completo: 'x', fonte: 'MANUAL' }
    mudarAutorizacao(ficha, 'NAO_AUTORIZADO')
    expect(ficha).toMatchObject({
      autorizacao_publicacao: 'NAO_AUTORIZADO',
      status_uso: 'DESCARTADO',
      motivo_descarte: 'SEM_AUTORIZACAO',
    })
    expect(validarDepoimento(ficha)).toEqual([])
  })
  it('outra autorizacao nao mexe no status', () => {
    const ficha = { ...novaFicha(), status_uso: 'FEITO' }
    mudarAutorizacao(ficha, 'AUTORIZADO')
    expect(ficha.autorizacao_publicacao).toBe('AUTORIZADO')
    expect(ficha.status_uso).toBe('FEITO')
  })
})

describe('mudarStatus', () => {
  it('sair do descarte limpa motivo e observacao', () => {
    const ficha = {
      ...novaFicha(), status_uso: 'DESCARTADO', motivo_descarte: 'OUTRO',
      observacao_descarte: 'repetido',
    }
    mudarStatus(ficha, 'DISPONIVEL')
    expect(ficha).toMatchObject({
      status_uso: 'DISPONIVEL', motivo_descarte: '', observacao_descarte: '',
    })
  })
  it('ir para o descarte mantem o que ja havia', () => {
    const ficha = { ...novaFicha(), observacao_descarte: 'nota' }
    mudarStatus(ficha, 'DESCARTADO')
    expect(ficha.status_uso).toBe('DESCARTADO')
    expect(ficha.observacao_descarte).toBe('nota')
  })
})

describe('podeEditar', () => {
  it('ficha nova sempre edita', () => {
    expect(podeEditar(null, false)).toBe(true)
    expect(podeEditar(null, true)).toBe(true)
  })
  it('edicao so edita se o carregamento deu certo (senao salvar criaria outro depoimento)', () => {
    expect(podeEditar(12, false)).toBe(true)
    expect(podeEditar(12, true)).toBe(false)
  })
})

describe('chaves locais de lista', () => {
  it('fabricas dao _chave unica a participacao, nota e resultado', () => {
    const chaves = [novaParticipacao(), novaParticipacao(), novaNota(null), novoResultado()]
      .map((item) => item._chave)
    expect(chaves.every((c) => c != null)).toBe(true)
    expect(new Set(chaves).size).toBe(4)
  })
  it('comChaves poe _chave no que veio do banco, sem trocar a que ja existe', () => {
    const ficha = {
      participacoes: [{ id: 3, _chave: 'fixa', notas: [{ id: 5 }], resultados: [{ id: 6 }] }],
    }
    const pronta = comChaves(ficha)
    expect(pronta).toBe(ficha)
    const [p] = ficha.participacoes
    expect(p._chave).toBe('fixa')
    expect(p.notas[0]._chave).not.toBeUndefined()
    expect(p.resultados[0]._chave).not.toBe(p.notas[0]._chave)
  })
})
