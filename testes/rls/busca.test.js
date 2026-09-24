import { describe, it, expect, beforeAll } from 'vitest'
import { conectar } from './ajuda.js'

let idFisica, idMatematica, idIta, idDepoimento

beforeAll(async () => {
  const c = await conectar()
  idFisica = (await c.query(
    `insert into materia (nome) values ('Fisica')
     on conflict (nome) do update set nome = excluded.nome
     returning id`)).rows[0].id
  idMatematica = (await c.query(
    `insert into materia (nome) values ('Matematica')
     on conflict (nome) do update set nome = excluded.nome
     returning id`)).rows[0].id
  idIta = (await c.query(
    `insert into instituicao (nome_canonico) values ('ITA')
     on conflict (nome_canonico) do update set nome_canonico = excluded.nome_canonico
     returning id`)).rows[0].id

  const enem = (await c.query(
    `insert into prova (nome) values ('ENEM')
     on conflict (nome) do update set nome = excluded.nome
     returning id`)).rows[0].id
  const vestIta = (await c.query(
    `insert into prova (nome, instituicao_id) values ('Vestibular do ITA', $1)
     on conflict (nome) do update set instituicao_id = excluded.instituicao_id
     returning id`, [idIta])).rows[0].id

  // Um depoimento, DUAS participacoes:
  // a nota esta numa, a aprovacao esta na outra.
  idDepoimento = (await c.query(
    `insert into depoimento (texto_completo, fonte)
     values ('Gabaritei fisica no ENEM e passei no ITA', 'MANUAL') returning id`)
  ).rows[0].id

  const pEnem = (await c.query(
    `insert into participacao (depoimento_id, prova_id, ano)
     values ($1, $2, 2025) returning id`, [idDepoimento, enem])).rows[0].id
  await c.query(
    `insert into nota (participacao_id, materia_id, valor_original, escala)
     values ($1, $2, 100, 'PERCENTUAL')`, [pEnem, idFisica])

  const pIta = (await c.query(
    `insert into participacao (depoimento_id, prova_id, ano)
     values ($1, $2, 2025) returning id`, [idDepoimento, vestIta])).rows[0].id
  await c.query(
    `insert into resultado (participacao_id, instituicao_id, situacao)
     values ($1, $2, 'APROVADO')`, [pIta, idIta])

  await c.end()
})

async function buscar(filtros) {
  const c = await conectar()
  try {
    const { rows } = await c.query(
      'select id from buscar_depoimentos($1::jsonb)', [JSON.stringify(filtros)])
    return rows.map((r) => Number(r.id))
  } finally { await c.end() }
}

describe('semantica dos filtros', () => {
  it('ENCONTRA com 100% em fisica E aprovado no ITA, em participacoes diferentes', async () => {
    const achados = await buscar({
      notas: [{ materia_id: idFisica, minimo: 100 }],
      instituicoes: [idIta],
    })
    expect(achados).toContain(Number(idDepoimento))
  })

  it('encontra so com a nota', async () => {
    expect(await buscar({ notas: [{ materia_id: idFisica, minimo: 100 }] }))
      .toContain(Number(idDepoimento))
  })

  it('encontra so com a instituicao', async () => {
    expect(await buscar({ instituicoes: [idIta] })).toContain(Number(idDepoimento))
  })

  it('NAO encontra com 100% em matematica e aprovado no ITA', async () => {
    expect(await buscar({
      notas: [{ materia_id: idMatematica, minimo: 100 }],
      instituicoes: [idIta],
    })).not.toContain(Number(idDepoimento))
  })

  it('filtro de ano nao exige coincidencia com a instituicao', async () => {
    expect(await buscar({ ano: 2025, instituicoes: [idIta] }))
      .toContain(Number(idDepoimento))
  })
})
