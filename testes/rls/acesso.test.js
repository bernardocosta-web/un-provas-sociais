import { describe, it, expect, beforeAll } from 'vitest'
import { conectar, comoAnonimo, comoUsuario } from './ajuda.js'

const MEMBRO = 'membro@exemplo.test'
const INATIVO = 'inativo@exemplo.test'
const ESTRANHO = 'estranho@exemplo.test'

beforeAll(async () => {
  const cliente = await conectar()
  await cliente.query(`
    insert into membro_equipe (email, nome, ativo) values
      ($1, 'Membro Ativo', true),
      ($2, 'Membro Inativo', false)
    on conflict (email) do nothing
  `, [MEMBRO, INATIVO])
  await cliente.query(`
    insert into instituicao (nome_canonico) values ('ITA')
    on conflict do nothing
  `)
  await cliente.end()
})

describe('acesso a instituicao', () => {
  it('visitante sem login nao le nada', async () => {
    const linhas = await comoAnonimo((c) =>
      c.query('select * from instituicao').then((r) => r.rows))
    expect(linhas).toEqual([])
  })

  it('logado fora da lista nao le nada', async () => {
    const linhas = await comoUsuario(ESTRANHO, (c) =>
      c.query('select * from instituicao').then((r) => r.rows))
    expect(linhas).toEqual([])
  })

  it('logado inativo nao le nada', async () => {
    const linhas = await comoUsuario(INATIVO, (c) =>
      c.query('select * from instituicao').then((r) => r.rows))
    expect(linhas).toEqual([])
  })

  it('membro ativo le', async () => {
    const linhas = await comoUsuario(MEMBRO, (c) =>
      c.query('select * from instituicao').then((r) => r.rows))
    expect(linhas.length).toBeGreaterThan(0)
  })

  it('visitante nao escreve', async () => {
    await expect(
      comoAnonimo((c) =>
        c.query(`insert into instituicao (nome_canonico) values ('INVASOR')`))
    ).rejects.toThrow()
  })

  it('ninguem escreve em membro_equipe pela API', async () => {
    await expect(
      comoUsuario(MEMBRO, (c) =>
        c.query(`insert into membro_equipe (email, nome) values ('x@exemplo.test','X')`))
    ).rejects.toThrow()
  })
})
