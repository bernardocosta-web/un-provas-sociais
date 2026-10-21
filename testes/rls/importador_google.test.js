import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { conectar, comoUsuario } from './ajuda.js'

// ADR 0001 (subprojeto #2): colunas do importador do Google e o status
// EM_REVISAO. Marcador unico por execucao e limpeza no afterAll: roda de
// novo sem reset. Dados inventados.

const MEMBRO = 'membro@exemplo.test'
const MARCADOR = `MARCADORIMPORTADOR${randomBytes(4).toString('hex')}`
const ext = (sufixo) => `${MARCADOR}-${sufixo}`

async function inserir(c, campos) {
  const chaves = Object.keys(campos)
  const r = await c.query(
    `insert into depoimento (texto_completo, fonte, ${chaves.join(', ')})
     values ($1, 'GOOGLE_REVIEW', ${chaves.map((_, i) => `$${i + 2}`).join(', ')}) returning id`,
    [`Depoimento ${MARCADOR}`, ...Object.values(campos)])
  return Number(r.rows[0].id)
}

async function falha(fn) {
  const c = await conectar()
  try {
    await fn(c)
    return null
  } catch (err) {
    return err.code
  } finally {
    await c.end()
  }
}

afterAll(async () => {
  const c = await conectar()
  try {
    await c.query('delete from depoimento where texto_completo like $1', [`%${MARCADOR}%`])
  } finally {
    await c.end()
  }
})

describe('depoimento: colunas do importador', () => {
  it('id_externo e unico por fonte: o mesmo id duas vezes no Google e recusado', async () => {
    const c = await conectar()
    try {
      await inserir(c, { id_externo: ext('dup') })
    } finally {
      await c.end()
    }
    expect(await falha((c) => inserir(c, { id_externo: ext('dup') }))).toBe('23505')
  })

  it('o mesmo id_externo em outra fonte e permitido (unique composto)', async () => {
    const c = await conectar()
    try {
      await inserir(c, { id_externo: ext('outrafonte') })
      const r = await c.query(
        `insert into depoimento (texto_completo, fonte, id_externo)
         values ($1, 'GOOGLE_FORMS', $2) returning id`,
        [`Depoimento ${MARCADOR}`, ext('outrafonte')])
      expect(r.rows).toHaveLength(1)
    } finally {
      await c.end()
    }
  })

  it('id_externo nulo pode repetir (depoimento manual nao tem id externo)', async () => {
    const c = await conectar()
    try {
      await inserir(c, { id_externo: null })
      await inserir(c, { id_externo: null })
    } finally {
      await c.end()
    }
  })

  it('id_externo so de espacos e recusado', async () => {
    expect(await falha((c) => inserir(c, { id_externo: '   ' }))).toBe('23514')
  })

  it('nota aceita 1 a 5 e recusa fora disso', async () => {
    expect(await falha((c) => inserir(c, { nota: 5 }))).toBeNull()
    expect(await falha((c) => inserir(c, { nota: 1 }))).toBeNull()
    expect(await falha((c) => inserir(c, { nota: 0 }))).toBe('23514')
    expect(await falha((c) => inserir(c, { nota: 6 }))).toBe('23514')
  })

  it('imagens: padrao [] e so aceita array', async () => {
    const c = await conectar()
    try {
      const id = await inserir(c, { autor_foto_url: 'https://exemplo.test/a.jpg' })
      const r = await c.query('select imagens from depoimento where id = $1', [id])
      expect(r.rows[0].imagens).toEqual([])
    } finally {
      await c.end()
    }
    expect(await falha((c) => inserir(c, { imagens: JSON.stringify(['https://exemplo.test/i.jpg']) }))).toBeNull()
    expect(await falha((c) => inserir(c, { imagens: JSON.stringify({ a: 1 }) }))).toBe('23514')
  })
})

describe('buscar_depoimentos: EM_REVISAO fica fora da busca padrao', () => {
  const ids = {}

  beforeAll(async () => {
    const c = await conectar()
    try {
      await c.query(
        `insert into membro_equipe (email, nome, ativo) values ($1, 'Membro Ativo', true)
         on conflict (email) do nothing`, [MEMBRO])
      ids.disponivel = await inserir(c, { status_uso: 'DISPONIVEL' })
      ids.revisao = await inserir(c, { status_uso: 'EM_REVISAO' })
    } finally {
      await c.end()
    }
  })

  async function buscar(extra) {
    const filtros = { texto: MARCADOR, ...extra }
    return comoUsuario(MEMBRO, (c) =>
      c.query('select id, status_uso from buscar_depoimentos($1::jsonb)', [JSON.stringify(filtros)])
        .then((r) => r.rows.filter((row) => ['DISPONIVEL', 'EM_REVISAO'].includes(row.status_uso))
          .map((row) => Number(row.id)).filter((id) => id === ids.disponivel || id === ids.revisao)))
  }

  it('sem filtro de status, EM_REVISAO nao aparece', async () => {
    expect(await buscar({})).toEqual([ids.disponivel])
  })

  it('lista de status vazia equivale a sem filtro: EM_REVISAO segue de fora', async () => {
    expect(await buscar({ status: [] })).toEqual([ids.disponivel])
  })

  it('pedindo EM_REVISAO explicitamente, ele aparece', async () => {
    expect(await buscar({ status: ['EM_REVISAO'] })).toEqual([ids.revisao])
  })
})
