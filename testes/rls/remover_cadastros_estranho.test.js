import { describe, it, expect } from 'vitest'
import { conectar } from './ajuda.js'

// Estranho (fora da equipe) tentando remover cada tipo de cadastro. Uma so
// conexao/transacao, com um savepoint por tentativa: os quatro cadastros sao
// criados como postgres (bypassa RLS) e continuam visiveis ao trocar so o
// PAPEL da consulta para authenticated (SET LOCAL role e claims valem so
// dentro da mesma transacao) — mesmo padrao do teste "estranho" de
// mesclar.test.js. "rollback to savepoint" desfaz o SET LOCAL e volta ao
// papel de conectar() (sem RLS), permitindo conferir o estado depois de cada
// tentativa sem perder o restante do cenario.
async function tentarComoEstranho(c, sql, params) {
  await c.query('savepoint antes_da_tentativa')
  await c.query('set local role authenticated')
  await c.query('select set_config($1, $2, true)', [
    'request.jwt.claims',
    JSON.stringify({ role: 'authenticated', email: 'estranho@exemplo.test' }),
  ])
  await expect(c.query(sql, params))
    .rejects.toMatchObject({ message: expect.stringContaining('não existe') })
  await c.query('rollback to savepoint antes_da_tentativa')
}

describe('remover_instituicao e remover_cadastro_simples: estranho fora da equipe', () => {
  it('recusa remover instituicao, prova, curso e materia pela causa real (RLS/"nao existe"), e nao muda nada', async () => {
    const c = await conectar()
    try {
      await c.query('begin')
      const sufixo = 'MARCADORREMOVERESTRANHO'
      const inst = (await c.query(
        `insert into instituicao (nome_canonico) values ($1) returning id`,
        [`Instituicao ${sufixo}`])).rows[0].id
      const prova = (await c.query(
        `insert into prova (nome) values ($1) returning id`, [`Prova ${sufixo}`])).rows[0].id
      const curso = (await c.query(
        `insert into curso (nome) values ($1) returning id`, [`Curso ${sufixo}`])).rows[0].id
      const materia = (await c.query(
        `insert into materia (nome) values ($1) returning id`, [`Materia ${sufixo}`])).rows[0].id

      await tentarComoEstranho(c, 'select public.remover_instituicao($1)', [inst])
      await tentarComoEstranho(c, `select public.remover_cadastro_simples('prova', $1)`, [prova])
      await tentarComoEstranho(c, `select public.remover_cadastro_simples('curso', $1)`, [curso])
      await tentarComoEstranho(c, `select public.remover_cadastro_simples('materia', $1)`, [materia])

      const restou = await c.query(
        `select
           (select count(*)::int from instituicao where id = $1) as instituicao,
           (select count(*)::int from prova where id = $2) as prova,
           (select count(*)::int from curso where id = $3) as curso,
           (select count(*)::int from materia where id = $4) as materia`,
        [inst, prova, curso, materia])
      expect(restou.rows[0]).toEqual({ instituicao: 1, prova: 1, curso: 1, materia: 1 })
    } finally {
      await c.query('rollback').catch(() => {})
      await c.end()
    }
  })
})
