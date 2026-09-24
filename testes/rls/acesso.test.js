import { describe, it, expect, beforeAll } from 'vitest'
import { conectar, comoAnonimo, comoUsuario } from './ajuda.js'

const MEMBRO = 'membro@exemplo.test'
const INATIVO = 'inativo@exemplo.test'
const ESTRANHO = 'estranho@exemplo.test'

// Erro real do RLS, nao qualquer erro (typo de coluna, violacao de constraint etc).
const ERRO_RLS = /row-level security|permission denied/

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
    ).rejects.toThrow(ERRO_RLS)
  })

  it('estranho nao escreve (insert)', async () => {
    await expect(
      comoUsuario(ESTRANHO, (c) =>
        c.query(`insert into instituicao (nome_canonico) values ('INVASOR')`))
    ).rejects.toThrow(ERRO_RLS)
  })

  it('inativo nao escreve (insert)', async () => {
    await expect(
      comoUsuario(INATIVO, (c) =>
        c.query(`insert into instituicao (nome_canonico) values ('INVASOR')`))
    ).rejects.toThrow(ERRO_RLS)
  })

  it('estranho tenta update em instituicao: afeta 0 linhas e nao altera o dado', async () => {
    await comoUsuario(ESTRANHO, async (c) => {
      const resultado = await c.query(
        `update instituicao set nome_canonico = 'HACKEADO' where nome_canonico = 'ITA'`)
      expect(resultado.rowCount).toBe(0)

      // volta ao papel de conexao (postgres, superusuario) so para provar,
      // dentro da mesma transacao, que a linha continua intacta.
      await c.query('reset role')
      const { rows } = await c.query(
        `select nome_canonico from instituicao where nome_canonico = 'ITA'`)
      expect(rows).toEqual([{ nome_canonico: 'ITA' }])
    })
  })

  it('estranho tenta delete em instituicao: afeta 0 linhas e nao remove o dado', async () => {
    await comoUsuario(ESTRANHO, async (c) => {
      const resultado = await c.query(
        `delete from instituicao where nome_canonico = 'ITA'`)
      expect(resultado.rowCount).toBe(0)

      await c.query('reset role')
      const { rows } = await c.query(
        `select nome_canonico from instituicao where nome_canonico = 'ITA'`)
      expect(rows).toEqual([{ nome_canonico: 'ITA' }])
    })
  })
})

describe('acesso a membro_equipe', () => {
  it('visitante sem login nao le membro_equipe', async () => {
    const linhas = await comoAnonimo((c) =>
      c.query('select * from membro_equipe').then((r) => r.rows))
    expect(linhas).toEqual([])
  })

  it('estranho nao le membro_equipe', async () => {
    const linhas = await comoUsuario(ESTRANHO, (c) =>
      c.query('select * from membro_equipe').then((r) => r.rows))
    expect(linhas).toEqual([])
  })

  it('inativo nao le membro_equipe', async () => {
    const linhas = await comoUsuario(INATIVO, (c) =>
      c.query('select * from membro_equipe').then((r) => r.rows))
    expect(linhas).toEqual([])
  })

  it('membro ativo le membro_equipe', async () => {
    const linhas = await comoUsuario(MEMBRO, (c) =>
      c.query('select * from membro_equipe').then((r) => r.rows))
    expect(linhas.length).toBeGreaterThan(0)
  })

  it('ninguem escreve em membro_equipe pela API', async () => {
    await expect(
      comoUsuario(MEMBRO, (c) =>
        c.query(`insert into membro_equipe (email, nome) values ('x@exemplo.test','X')`))
    ).rejects.toThrow(ERRO_RLS)
  })
})
