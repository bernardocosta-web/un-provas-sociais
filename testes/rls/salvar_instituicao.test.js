import { describe, it, expect, beforeAll } from 'vitest'
import { conectar, comoUsuario } from './ajuda.js'

const MEMBRO = 'membro@exemplo.test'

beforeAll(async () => {
  const c = await conectar()
  await c.query(
    `insert into membro_equipe (email, nome, ativo) values ($1, 'Membro Ativo', true)
     on conflict (email) do nothing`, [MEMBRO])
  await c.end()
})

describe('salvar_instituicao', () => {
  it('insere uma instituicao nova com apelidos', async () => {
    const c = await conectar()
    try {
      await c.query('begin')
      const sufixo = 'MARCADORSALVAR1'
      const resultado = await c.query('select public.salvar_instituicao($1::jsonb) as id', [
        JSON.stringify({
          nome_canonico: `Nova ${sufixo}`,
          logo_path: `logo-${sufixo}.webp`,
          apelidos: [`Apelido B ${sufixo}`, `Apelido A ${sufixo}`],
        }),
      ])
      // bigint volta como string do driver pg (nao cabe com seguranca em
      // number); mesma convenção de mesclar.test.js.
      const id = resultado.rows[0].id
      expect(Number(id)).toBeGreaterThan(0)

      const linha = (await c.query(
        'select nome_canonico, logo_path, ativo from instituicao where id = $1', [id])).rows[0]
      expect(linha).toEqual({
        nome_canonico: `Nova ${sufixo}`, logo_path: `logo-${sufixo}.webp`, ativo: true,
      })

      const apelidos = await c.query(
        'select apelido from instituicao_apelido where instituicao_id = $1 order by apelido', [id])
      expect(apelidos.rows.map((r) => r.apelido)).toEqual(
        [`Apelido A ${sufixo}`, `Apelido B ${sufixo}`])
    } finally {
      await c.query('rollback').catch(() => {})
      await c.end()
    }
  })

  // O payload pode repetir o mesmo apelido (clique duplo em "adicionar", ou
  // duas entradas diferindo so em espaco) — isso nao pode virar 23505 contra
  // si mesmo. A colisao que a funcao recusa e com o apelido de OUTRA
  // instituicao (teste de colisao abaixo), nao consigo mesma.
  it('deduplica apelidos repetidos (inclusive com espacos) no mesmo payload, sem erro', async () => {
    const c = await conectar()
    try {
      await c.query('begin')
      const sufixo = 'MARCADORSALVAR5'
      const resultado = await c.query('select public.salvar_instituicao($1::jsonb) as id', [
        JSON.stringify({
          nome_canonico: `Duplicada ${sufixo}`,
          apelidos: [`Dupe ${sufixo}`, `Dupe ${sufixo}`, `  Dupe ${sufixo}  `, `Unica ${sufixo}`],
        }),
      ])
      const id = resultado.rows[0].id

      const apelidos = await c.query(
        'select apelido from instituicao_apelido where instituicao_id = $1 order by apelido', [id])
      expect(apelidos.rows.map((r) => r.apelido)).toEqual(
        [`Dupe ${sufixo}`, `Unica ${sufixo}`])
    } finally {
      await c.query('rollback').catch(() => {})
      await c.end()
    }
  })

  it('atualiza uma instituicao existente e substitui os apelidos', async () => {
    const c = await conectar()
    try {
      await c.query('begin')
      const sufixo = 'MARCADORSALVAR2'
      const id = (await c.query(
        `insert into instituicao (nome_canonico, logo_path) values ($1, $2) returning id`,
        [`Original ${sufixo}`, `logo-original-${sufixo}.webp`])).rows[0].id
      await c.query(
        `insert into instituicao_apelido (instituicao_id, apelido) values ($1, $2)`,
        [id, `Apelido antigo ${sufixo}`])

      await c.query('select public.salvar_instituicao($1::jsonb)', [
        JSON.stringify({
          id, nome_canonico: `Atualizada ${sufixo}`, logo_path: `logo-nova-${sufixo}.webp`,
          apelidos: [`Apelido novo ${sufixo}`],
        }),
      ])

      const linha = (await c.query(
        'select nome_canonico, logo_path from instituicao where id = $1', [id])).rows[0]
      expect(linha).toEqual({
        nome_canonico: `Atualizada ${sufixo}`, logo_path: `logo-nova-${sufixo}.webp`,
      })

      const apelidos = await c.query(
        'select apelido from instituicao_apelido where instituicao_id = $1', [id])
      expect(apelidos.rows.map((r) => r.apelido)).toEqual([`Apelido novo ${sufixo}`])
    } finally {
      await c.query('rollback').catch(() => {})
      await c.end()
    }
  })

  // O defeito que este teste tranca: as tres chamadas separadas do client
  // (update instituicao -> delete apelidos -> insert apelidos) trocavam
  // logo_path e SO DEPOIS descobriam que um apelido colidia com o de outra
  // instituicao (apelido e unico globalmente) — a instituicao ficava com
  // logo_path novo e nenhum apelido. A funcao SQL faz tudo numa transacao so:
  // se a insercao dos apelidos falhar, nada muda, nem o update de instituicao.
  it('recusa salvar quando um apelido colide com o de outra instituicao, e nao muda nada', async () => {
    const c = await conectar()
    try {
      await c.query('begin')
      const sufixo = 'MARCADORSALVAR3'
      const base = (await c.query(
        `insert into instituicao (nome_canonico) values ($1) returning id`,
        [`Base ${sufixo}`])).rows[0].id
      await c.query(
        `insert into instituicao_apelido (instituicao_id, apelido) values ($1, $2)`,
        [base, `Compartilhado ${sufixo}`])

      const alvo = (await c.query(
        `insert into instituicao (nome_canonico, logo_path) values ($1, $2) returning id`,
        [`Alvo ${sufixo}`, `logo-antiga-${sufixo}.webp`])).rows[0].id
      await c.query(
        `insert into instituicao_apelido (instituicao_id, apelido) values ($1, $2)`,
        [alvo, `Existente ${sufixo}`])

      // savepoint: apos o erro esperado, a transacao fica abortada ate um
      // rollback — savepoint permite continuar conferindo o estado na mesma
      // transacao (que no final e desfeita inteira pelo rollback do finally).
      await c.query('savepoint antes_da_tentativa')
      await expect(c.query('select public.salvar_instituicao($1::jsonb)', [
        JSON.stringify({
          id: alvo, nome_canonico: `Alvo renomeado ${sufixo}`,
          logo_path: `logo-nova-${sufixo}.webp`,
          apelidos: [`Compartilhado ${sufixo}`],
        }),
      ])).rejects.toMatchObject({ code: '23505' })
      await c.query('rollback to savepoint antes_da_tentativa')

      const linha = (await c.query(
        'select nome_canonico, logo_path from instituicao where id = $1', [alvo])).rows[0]
      expect(linha).toEqual({ nome_canonico: `Alvo ${sufixo}`, logo_path: `logo-antiga-${sufixo}.webp` })

      const apelidos = await c.query(
        'select apelido from instituicao_apelido where instituicao_id = $1', [alvo])
      expect(apelidos.rows.map((r) => r.apelido)).toEqual([`Existente ${sufixo}`])
    } finally {
      await c.query('rollback').catch(() => {})
      await c.end()
    }
  })

  // Pelo caminho do app: authenticated precisa de EXECUTE (0012) e de
  // privilegio nas tabelas (0011); a RLS decide as linhas.
  it('membro ativo da equipe salva pela API', async () => {
    await comoUsuario(MEMBRO, async (c) => {
      const sufixo = 'MARCADORSALVAR4'
      const resultado = await c.query('select public.salvar_instituicao($1::jsonb) as id', [
        JSON.stringify({ nome_canonico: `Via API ${sufixo}`, apelidos: [] }),
      ])
      const id = resultado.rows[0].id
      const linha = await c.query('select nome_canonico from instituicao where id = $1', [id])
      expect(linha.rows[0].nome_canonico).toBe(`Via API ${sufixo}`)
    })
  })
})
