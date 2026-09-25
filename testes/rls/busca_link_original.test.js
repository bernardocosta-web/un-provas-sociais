import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { conectar, comoUsuario } from './ajuda.js'

// Task 21 (emenda 2026-09-24): buscar_depoimentos ganha tem_link_original,
// no mesmo padrao de tem_print. ausente/null nao filtra; true exige
// link_original nao nulo e nao so espaco; false exige o contrario.
// Marcador unico por execucao (o texto filtra so os depoimentos deste
// arquivo) e limpeza no afterAll: roda de novo sem reset.

const MEMBRO = 'membro@exemplo.test'
const MARCADOR = `MARCADORLINKORIGINAL${randomBytes(4).toString('hex')}`

const ids = {}

beforeAll(async () => {
  const c = await conectar()
  try {
    await c.query(
      `insert into membro_equipe (email, nome, ativo) values ($1, 'Membro Ativo', true)
       on conflict (email) do nothing`, [MEMBRO])
    const casos = { comLink: 'https://exemplo.test/avaliacao', semLink: null, emBranco: '   ' }
    for (const [chave, link] of Object.entries(casos)) {
      ids[chave] = Number((await c.query(
        `insert into depoimento (texto_completo, fonte, link_original)
         values ($1, 'GOOGLE_REVIEW', $2) returning id`,
        [`Depoimento ${MARCADOR} ${chave}`, link])).rows[0].id)
    }
  } finally {
    await c.end()
  }
})

afterAll(async () => {
  const c = await conectar()
  try {
    await c.query('delete from depoimento where texto_completo like $1', [`%${MARCADOR}%`])
  } finally {
    await c.end()
  }
})

async function buscar(extra) {
  const filtros = { texto: MARCADOR, ...extra }
  return comoUsuario(MEMBRO, (c) =>
    c.query('select id from buscar_depoimentos($1::jsonb)', [JSON.stringify(filtros)])
      .then((r) => r.rows.map((row) => Number(row.id)).sort((a, b) => a - b)))
}

const ordenados = (...lista) => lista.sort((a, b) => a - b)

describe('buscar_depoimentos: tem_link_original', () => {
  it('ausente nao filtra: os tres aparecem', async () => {
    expect(await buscar({})).toEqual(ordenados(ids.comLink, ids.semLink, ids.emBranco))
  })

  it('null explicito tambem nao filtra', async () => {
    expect(await buscar({ tem_link_original: null }))
      .toEqual(ordenados(ids.comLink, ids.semLink, ids.emBranco))
  })

  it('true traz so quem tem link de verdade (string so de espacos nao conta)', async () => {
    expect(await buscar({ tem_link_original: true })).toEqual([ids.comLink])
  })

  it('false traz o nulo e o so-espacos', async () => {
    expect(await buscar({ tem_link_original: false }))
      .toEqual(ordenados(ids.semLink, ids.emBranco))
  })

  it('combina com tem_print (AND no nivel do depoimento)', async () => {
    expect(await buscar({ tem_link_original: true, tem_print: true })).toEqual([])
    expect(await buscar({ tem_link_original: true, tem_print: false })).toEqual([ids.comLink])
  })
})
