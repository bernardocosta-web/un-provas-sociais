import { describe, it, expect } from 'vitest'
import { sugerirAlunos, buscarAlunos } from '../../src/lib/alunos.js'

const ANA = {
  id: 1, nome_exibicao: 'Ana Exemplo',
  perfis: [{ plataforma: 'INSTAGRAM', identificador: '@ana.exemplo' },
    { plataforma: 'GOOGLE', identificador: 'Ána Exemplo' }],
}
const ANA_OUTRA = {
  id: 2, nome_exibicao: 'Ana Exemplo',
  perfis: [{ plataforma: 'YOUTUBE', identificador: 'anaexemplo2' }],
}
const BRUNO = { id: 3, nome_exibicao: 'Bruno Teste', perfis: [] }
const ALUNOS = [ANA, ANA_OUTRA, BRUNO]

describe('sugerirAlunos', () => {
  it('acha pelo identificador do perfil, sem acento, caixa nem espaco', () => {
    expect(sugerirAlunos('  ana   EXEMPLO ', '', ALUNOS).map((a) => a.id)).toEqual([1])
  })
  it('acha pelo contato, com ou sem @', () => {
    expect(sugerirAlunos('', 'ana.exemplo', ALUNOS).map((a) => a.id)).toEqual([1])
    expect(sugerirAlunos('', '@anaexemplo2', ALUNOS).map((a) => a.id)).toEqual([2])
  })
  it('nao sugere pelo nome de exibicao: nomes se repetem', () => {
    expect(sugerirAlunos('Bruno Teste', '', ALUNOS)).toEqual([])
  })
  it('trecho nao basta', () => {
    expect(sugerirAlunos('ana', '', ALUNOS)).toEqual([])
  })
  it('autor e contato em branco nao sugerem nada', () => {
    expect(sugerirAlunos('', '  ', ALUNOS)).toEqual([])
    expect(sugerirAlunos(null, undefined, ALUNOS)).toEqual([])
  })
  it('aluno sem perfis nao quebra', () => {
    expect(sugerirAlunos('x', 'y', [{ id: 9, nome_exibicao: 'Z' }])).toEqual([])
  })
})

describe('buscarAlunos', () => {
  it('acha por trecho do nome ou do identificador', () => {
    expect(buscarAlunos(ALUNOS, 'exem').map((a) => a.id)).toEqual([1, 2])
    expect(buscarAlunos(ALUNOS, 'anaexemplo2').map((a) => a.id)).toEqual([2])
    expect(buscarAlunos(ALUNOS, 'bruno').map((a) => a.id)).toEqual([3])
  })
  it('termo em branco nao lista ninguem', () => {
    expect(buscarAlunos(ALUNOS, ' ')).toEqual([])
  })
  it('respeita o limite', () => {
    expect(buscarAlunos(ALUNOS, 'a', 1)).toHaveLength(1)
  })
})
