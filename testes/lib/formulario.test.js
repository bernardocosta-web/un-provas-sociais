import { describe, it, expect } from 'vitest'
import {
  escalaPadrao, aplicarProva, novaFicha, novaParticipacao, novaNota, novoResultado,
  mudarAutorizacao, mudarStatus,
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
    expect(novoResultado()).toEqual({ instituicao_id: '', curso_id: '', situacao: '' })
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
