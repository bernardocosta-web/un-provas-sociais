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

describe('remover_instituicao', () => {
  it('remove instituicao sem uso, apaga os apelidos e devolve o logo_path', async () => {
    const c = await conectar()
    try {
      await c.query('begin')
      const sufixo = 'MARCADORREMOVERINST1'
      const id = (await c.query(
        `insert into instituicao (nome_canonico, logo_path) values ($1, $2) returning id`,
        [`Sem Uso ${sufixo}`, `logo-${sufixo}.webp`])).rows[0].id
      await c.query(
        `insert into instituicao_apelido (instituicao_id, apelido) values ($1, $2)`,
        [id, `Apelido ${sufixo}`])

      const resultado = await c.query('select public.remover_instituicao($1) as logo', [id])
      expect(resultado.rows[0].logo).toBe(`logo-${sufixo}.webp`)

      const restou = await c.query('select count(*)::int as n from instituicao where id = $1', [id])
      expect(restou.rows[0].n).toBe(0)
      const apelidos = await c.query(
        'select count(*)::int as n from instituicao_apelido where instituicao_id = $1', [id])
      expect(apelidos.rows[0].n).toBe(0)
    } finally {
      await c.query('rollback').catch(() => {})
      await c.end()
    }
  })

  it('recusa remover instituicao usada em resultado, citando Mesclar, e nao muda nada', async () => {
    const c = await conectar()
    try {
      await c.query('begin')
      const sufixo = 'MARCADORREMOVERINST2'
      const id = (await c.query(
        `insert into instituicao (nome_canonico) values ($1) returning id`,
        [`Em Uso ${sufixo}`])).rows[0].id
      const prova = (await c.query(
        `insert into prova (nome) values ($1) returning id`, [`Prova ${sufixo}`])).rows[0].id
      const dep = (await c.query(
        `insert into depoimento (texto_completo, fonte) values ($1, 'MANUAL') returning id`,
        [`Uso ${sufixo}`])).rows[0].id
      const part = (await c.query(
        `insert into participacao (depoimento_id, prova_id, ano) values ($1, $2, 2025) returning id`,
        [dep, prova])).rows[0].id
      await c.query(
        `insert into resultado (participacao_id, instituicao_id, situacao) values ($1, $2, 'APROVADO')`,
        [part, id])

      await c.query('savepoint antes_da_tentativa')
      // Sem a parte de prova (contagem zero): so "1 resultado(s)".
      await expect(c.query('select public.remover_instituicao($1)', [id]))
        .rejects.toThrow(new RegExp(
          `Em Uso ${sufixo}.*está em uso em 1 resultado\\(s\\)\\. Para juntar.*Mesclar`, 's'))
      await c.query('rollback to savepoint antes_da_tentativa')

      const restou = await c.query('select count(*)::int as n from instituicao where id = $1', [id])
      expect(restou.rows[0].n).toBe(1)
    } finally {
      await c.query('rollback').catch(() => {})
      await c.end()
    }
  })

  it('recusa remover instituicao usada so em prova.instituicao_id, e nao muda nada', async () => {
    const c = await conectar()
    try {
      await c.query('begin')
      const sufixo = 'MARCADORREMOVERINST3'
      const id = (await c.query(
        `insert into instituicao (nome_canonico) values ($1) returning id`,
        [`Dona Da Prova ${sufixo}`])).rows[0].id
      await c.query(
        `insert into prova (nome, instituicao_id) values ($1, $2)`, [`Prova ${sufixo}`, id])

      await c.query('savepoint antes_da_tentativa')
      // Sem a parte de resultado (contagem zero): so "1 prova(s)".
      await expect(c.query('select public.remover_instituicao($1)', [id]))
        .rejects.toThrow(new RegExp(
          `Dona Da Prova ${sufixo}.*está em uso em 1 prova\\(s\\)\\. Para juntar.*Mesclar`, 's'))
      await c.query('rollback to savepoint antes_da_tentativa')

      const restou = await c.query('select count(*)::int as n from instituicao where id = $1', [id])
      expect(restou.rows[0].n).toBe(1)
    } finally {
      await c.query('rollback').catch(() => {})
      await c.end()
    }
  })

  it('recusa remover instituicao usada em resultado E em prova, juntando as duas partes com "e"', async () => {
    const c = await conectar()
    try {
      await c.query('begin')
      const sufixo = 'MARCADORREMOVERINST5'
      const id = (await c.query(
        `insert into instituicao (nome_canonico) values ($1) returning id`,
        [`Em Uso Dobrado ${sufixo}`])).rows[0].id
      const prova = (await c.query(
        `insert into prova (nome, instituicao_id) values ($1, $2) returning id`,
        [`Prova ${sufixo}`, id])).rows[0].id
      const dep = (await c.query(
        `insert into depoimento (texto_completo, fonte) values ($1, 'MANUAL') returning id`,
        [`Uso ${sufixo}`])).rows[0].id
      const part = (await c.query(
        `insert into participacao (depoimento_id, prova_id, ano) values ($1, $2, 2025) returning id`,
        [dep, prova])).rows[0].id
      await c.query(
        `insert into resultado (participacao_id, instituicao_id, situacao) values ($1, $2, 'APROVADO')`,
        [part, id])

      await c.query('savepoint antes_da_tentativa')
      await expect(c.query('select public.remover_instituicao($1)', [id]))
        .rejects.toThrow(new RegExp(
          `Em Uso Dobrado ${sufixo}.*está em uso em 1 resultado\\(s\\) e 1 prova\\(s\\)\\. Para juntar.*Mesclar`, 's'))
      await c.query('rollback to savepoint antes_da_tentativa')

      const restou = await c.query('select count(*)::int as n from instituicao where id = $1', [id])
      expect(restou.rows[0].n).toBe(1)
    } finally {
      await c.query('rollback').catch(() => {})
      await c.end()
    }
  })

  it('instituicao inexistente: "nao existe"', async () => {
    const c = await conectar()
    try {
      await c.query('begin')
      await expect(c.query('select public.remover_instituicao($1)', [999999999]))
        .rejects.toMatchObject({ message: expect.stringContaining('não existe') })
    } finally {
      await c.query('rollback').catch(() => {})
      await c.end()
    }
  })

  // Pelo caminho do app: authenticated precisa de EXECUTE e de privilegio na
  // tabela (0011); a RLS decide as linhas.
  it('membro ativo da equipe remove instituicao pela API', async () => {
    await comoUsuario(MEMBRO, async (c) => {
      const sufixo = 'MARCADORREMOVERINST4'
      const id = (await c.query(
        `insert into instituicao (nome_canonico) values ($1) returning id`,
        [`Via API ${sufixo}`])).rows[0].id
      await c.query('select public.remover_instituicao($1)', [id])
      const restou = await c.query('select count(*)::int as n from instituicao where id = $1', [id])
      expect(restou.rows[0].n).toBe(0)
    })
  })
})
