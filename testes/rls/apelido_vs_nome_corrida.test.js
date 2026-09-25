import { describe, it, expect } from 'vitest'
import { conectar } from './ajuda.js'

// Corrida na regra apelido x nome (0013_apelido_vs_nome.sql). Sem trava, as
// checagens sao SELECTs comuns sob READ COMMITTED: duas transacoes que
// commitam ao mesmo tempo nao enxergam a linha uma da outra, e as duas
// passam (instituicao "CORRIDA B" numa, apelido "corrida b" de outra
// instituicao na outra). Com o pg_advisory_xact_lock no topo das funcoes de
// trigger, a segunda espera a primeira terminar e entao ve a linha dela.
// Arquivo separado de apelido_vs_nome.test.js: aqui as transacoes commitam
// de verdade, em duas conexoes; a limpeza apaga o que tiver ficado.

const M = 'MARCADORCORRIDA'
const RODADAS = 20

async function limpar() {
  const c = await conectar()
  try {
    await c.query('delete from instituicao where nome_canonico like $1', [`%${M}%`])
  } finally {
    await c.end()
  }
}

describe('regra apelido x nome sob escrita concorrente', () => {
  it('de duas transacoes conflitantes commitando juntas, so uma passa', async () => {
    const a = await conectar()
    const b = await conectar()
    const observado = []
    try {
      for (let i = 0; i < RODADAS; i++) {
        await a.query('begin')
        await a.query('insert into instituicao (nome_canonico) values ($1)', [`CORRIDA B ${M}${i}`])
        await b.query('begin')
        const t = (await b.query(
          'insert into instituicao (nome_canonico) values ($1) returning id',
          [`CORRIDA T ${M}${i}`])).rows[0].id
        await b.query('insert into instituicao_apelido (instituicao_id, apelido) values ($1, $2)',
          [t, `corrida b ${M.toLowerCase()}${i}`])

        const [ra, rb] = await Promise.allSettled([a.query('commit'), b.query('commit')])
        const falhas = [ra, rb].filter((r) => r.status === 'rejected')
        observado.push(falhas.length)
        expect(falhas.length, `rodada ${i}: commits que falharam`).toBe(1)
        expect(falhas[0].reason.code).toBe('P0001')
        expect(falhas[0].reason.message).toMatch(
          /já é (apelido de|o nome de outra instituição)/)
        await limpar()
      }
    } finally {
      await a.query('rollback').catch(() => {})
      await b.query('rollback').catch(() => {})
      await a.end()
      await b.end()
      await limpar()
    }
    expect(observado).toEqual(Array(RODADAS).fill(1))
    // Timeout explicito e generoso: 20 rodadas com duas conexoes e um DELETE
    // de limpeza cada uma passam longe do default de 5s do vitest, e mais
    // ainda contra um banco recem-subido (stack fria no CI, sem cache/warmup
    // do Postgres) em vez do banco local já quente.
  }, 30000)
})
