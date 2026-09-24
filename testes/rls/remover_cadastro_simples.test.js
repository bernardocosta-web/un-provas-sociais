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

describe('remover_cadastro_simples', () => {
  it('recusa remover prova com participacao, e nao muda nada', async () => {
    const c = await conectar()
    try {
      await c.query('begin')
      const sufixo = 'MARCADORREMOVERSIMP1'
      const prova = (await c.query(
        `insert into prova (nome) values ($1) returning id`, [`ENEM ${sufixo}`])).rows[0].id
      const dep = (await c.query(
        `insert into depoimento (texto_completo, fonte) values ($1, 'MANUAL') returning id`,
        [`Dep ${sufixo}`])).rows[0].id
      await c.query(
        `insert into participacao (depoimento_id, prova_id, ano) values ($1, $2, 2025)`, [dep, prova])

      await c.query('savepoint antes_da_tentativa')
      await expect(c.query(`select public.remover_cadastro_simples('prova', $1)`, [prova]))
        .rejects.toThrow(new RegExp(`ENEM ${sufixo}.*está em uso em 1 participação\\(ões\\)`))
      await c.query('rollback to savepoint antes_da_tentativa')

      const restou = await c.query('select count(*)::int as n from prova where id = $1', [prova])
      expect(restou.rows[0].n).toBe(1)
    } finally {
      await c.query('rollback').catch(() => {})
      await c.end()
    }
  })

  it('remove prova sem uso', async () => {
    const c = await conectar()
    try {
      await c.query('begin')
      const sufixo = 'MARCADORREMOVERSIMP2'
      const prova = (await c.query(
        `insert into prova (nome) values ($1) returning id`, [`Sem Uso ${sufixo}`])).rows[0].id
      await c.query(`select public.remover_cadastro_simples('prova', $1)`, [prova])
      const restou = await c.query('select count(*)::int as n from prova where id = $1', [prova])
      expect(restou.rows[0].n).toBe(0)
    } finally {
      await c.query('rollback').catch(() => {})
      await c.end()
    }
  })

  it('recusa remover curso usado em resultado, e nao muda nada', async () => {
    const c = await conectar()
    try {
      await c.query('begin')
      const sufixo = 'MARCADORREMOVERSIMP3'
      const curso = (await c.query(
        `insert into curso (nome) values ($1) returning id`, [`Medicina ${sufixo}`])).rows[0].id
      const prova = (await c.query(
        `insert into prova (nome) values ($1) returning id`, [`Prova ${sufixo}`])).rows[0].id
      const dep = (await c.query(
        `insert into depoimento (texto_completo, fonte) values ($1, 'MANUAL') returning id`,
        [`Dep ${sufixo}`])).rows[0].id
      const part = (await c.query(
        `insert into participacao (depoimento_id, prova_id, ano) values ($1, $2, 2025) returning id`,
        [dep, prova])).rows[0].id
      // situacao NAO_APROVADO: ck_aprovado_exige_instituicao so exige
      // instituicao_id quando APROVADO; aqui o que importa e so o curso_id.
      await c.query(
        `insert into resultado (participacao_id, curso_id, situacao) values ($1, $2, 'NAO_APROVADO')`,
        [part, curso])

      await c.query('savepoint antes_da_tentativa')
      await expect(c.query(`select public.remover_cadastro_simples('curso', $1)`, [curso]))
        .rejects.toThrow(new RegExp(`Medicina ${sufixo}.*está em uso em 1 resultado\\(s\\)`))
      await c.query('rollback to savepoint antes_da_tentativa')

      const restou = await c.query('select count(*)::int as n from curso where id = $1', [curso])
      expect(restou.rows[0].n).toBe(1)
    } finally {
      await c.query('rollback').catch(() => {})
      await c.end()
    }
  })

  it('remove curso sem uso', async () => {
    const c = await conectar()
    try {
      await c.query('begin')
      const sufixo = 'MARCADORREMOVERSIMP4'
      const curso = (await c.query(
        `insert into curso (nome) values ($1) returning id`, [`Sem Uso ${sufixo}`])).rows[0].id
      await c.query(`select public.remover_cadastro_simples('curso', $1)`, [curso])
      const restou = await c.query('select count(*)::int as n from curso where id = $1', [curso])
      expect(restou.rows[0].n).toBe(0)
    } finally {
      await c.query('rollback').catch(() => {})
      await c.end()
    }
  })

  it('recusa remover materia usada em nota, e nao muda nada', async () => {
    const c = await conectar()
    try {
      await c.query('begin')
      const sufixo = 'MARCADORREMOVERSIMP5'
      const materia = (await c.query(
        `insert into materia (nome) values ($1) returning id`, [`Matematica ${sufixo}`])).rows[0].id
      const prova = (await c.query(
        `insert into prova (nome) values ($1) returning id`, [`Prova ${sufixo}`])).rows[0].id
      const dep = (await c.query(
        `insert into depoimento (texto_completo, fonte) values ($1, 'MANUAL') returning id`,
        [`Dep ${sufixo}`])).rows[0].id
      const part = (await c.query(
        `insert into participacao (depoimento_id, prova_id, ano) values ($1, $2, 2025) returning id`,
        [dep, prova])).rows[0].id
      await c.query(
        `insert into nota (participacao_id, materia_id, valor_original, escala) values ($1, $2, 80, 'PERCENTUAL')`,
        [part, materia])

      await c.query('savepoint antes_da_tentativa')
      await expect(c.query(`select public.remover_cadastro_simples('materia', $1)`, [materia]))
        .rejects.toThrow(new RegExp(`Matematica ${sufixo}.*está em uso em 1 nota\\(s\\)`))
      await c.query('rollback to savepoint antes_da_tentativa')

      const restou = await c.query('select count(*)::int as n from materia where id = $1', [materia])
      expect(restou.rows[0].n).toBe(1)
    } finally {
      await c.query('rollback').catch(() => {})
      await c.end()
    }
  })

  it('remove materia sem uso', async () => {
    const c = await conectar()
    try {
      await c.query('begin')
      const sufixo = 'MARCADORREMOVERSIMP6'
      const materia = (await c.query(
        `insert into materia (nome) values ($1) returning id`, [`Sem Uso ${sufixo}`])).rows[0].id
      await c.query(`select public.remover_cadastro_simples('materia', $1)`, [materia])
      const restou = await c.query('select count(*)::int as n from materia where id = $1', [materia])
      expect(restou.rows[0].n).toBe(0)
    } finally {
      await c.query('rollback').catch(() => {})
      await c.end()
    }
  })

  it('recusa p_tabela fora da lista fechada (nunca SQL dinamico com texto livre)', async () => {
    const c = await conectar()
    try {
      await c.query('begin')
      await expect(c.query(`select public.remover_cadastro_simples('membro_equipe', $1)`, [1]))
        .rejects.toThrow(/inválida/)
    } finally {
      await c.query('rollback').catch(() => {})
      await c.end()
    }
  })

  it.each(['prova', 'curso', 'materia'])('%s inexistente: "nao existe"', async (tabela) => {
    const c = await conectar()
    try {
      await c.query('begin')
      await expect(c.query(`select public.remover_cadastro_simples($1, $2)`, [tabela, 999999999]))
        .rejects.toMatchObject({ message: expect.stringContaining('não existe') })
    } finally {
      await c.query('rollback').catch(() => {})
      await c.end()
    }
  })

  // Pelo caminho do app: authenticated precisa de EXECUTE e de privilegio na
  // tabela (0011); a RLS decide as linhas.
  it('membro ativo da equipe remove curso pela API', async () => {
    await comoUsuario(MEMBRO, async (c) => {
      const sufixo = 'MARCADORREMOVERSIMP7'
      const curso = (await c.query(
        `insert into curso (nome) values ($1) returning id`, [`Via API ${sufixo}`])).rows[0].id
      await c.query(`select public.remover_cadastro_simples('curso', $1)`, [curso])
      const restou = await c.query('select count(*)::int as n from curso where id = $1', [curso])
      expect(restou.rows[0].n).toBe(0)
    })
  })
})
