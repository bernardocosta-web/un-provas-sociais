import { describe, it, expect, beforeAll } from 'vitest'
import { conectar, comoUsuario } from './ajuda.js'
import { montarFiltros, filtrosParaUrl, urlParaFiltros, ESTADO_VAZIO } from '../../src/lib/filtros.js'

// Item 3 do brief de correcoes do Marco 2
// (.superpowers/sdd/2026-09-23-nucleo-depoimentos/marco-2-fix-brief.md):
// testes da semantica central de "N condicoes somadas" (percentual e TRI)
// e do contrato lib -> SQL de ponta a ponta. Fixture propria com marcador
// unico no texto para nao colidir com outros arquivos.

const MEMBRO = 'membro@exemplo.test'
const MARCADOR = 'MARCADORMULTICOND'
const MARCADOR_CONTRATO = 'MARCADORCONTRATOLIBSQL'

let idFisica, idMatematica, idEnem, idDepoimento

beforeAll(async () => {
  const c = await conectar()
  try {
    idFisica = (await c.query(
      `insert into materia (nome) values ('Fisica')
       on conflict (nome) do update set nome = excluded.nome
       returning id`)).rows[0].id
    idMatematica = (await c.query(
      `insert into materia (nome) values ('Matematica')
       on conflict (nome) do update set nome = excluded.nome
       returning id`)).rows[0].id
    idEnem = (await c.query(
      `insert into prova (nome) values ('ENEM')
       on conflict (nome) do update set nome = excluded.nome
       returning id`)).rows[0].id

    idDepoimento = (await c.query(
      `insert into depoimento (texto_completo, fonte)
       values ($1, 'MANUAL') returning id`,
      [`Depoimento ${MARCADOR} com fisica em pontos e matematica em percentual`],
    )).rows[0].id

    // Fisica PONTOS 45 de 45 -> percentual derivado 100.
    const pFisica = (await c.query(
      `insert into participacao (depoimento_id, prova_id, ano)
       values ($1, $2, 2025) returning id`, [idDepoimento, idEnem])).rows[0].id
    await c.query(
      `insert into nota (participacao_id, materia_id, valor_original, escala, valor_maximo)
       values ($1, $2, 45, 'PONTOS', 45)`, [pFisica, idFisica])

    // Matematica PERCENTUAL 92, em OUTRA participacao.
    const pMatematica = (await c.query(
      `insert into participacao (depoimento_id, prova_id, ano)
       values ($1, $2, 2025) returning id`, [idDepoimento, idEnem])).rows[0].id
    await c.query(
      `insert into nota (participacao_id, materia_id, valor_original, escala)
       values ($1, $2, 92, 'PERCENTUAL')`, [pMatematica, idMatematica])

    // Duas notas TRI (mesma participacao, materias diferentes), para os
    // testes de "N condicoes de TRI somadas".
    const pTri = (await c.query(
      `insert into participacao (depoimento_id, prova_id, ano)
       values ($1, $2, 2025) returning id`, [idDepoimento, idEnem])).rows[0].id
    await c.query(
      `insert into nota (participacao_id, materia_id, valor_original, escala)
       values ($1, $2, 550, 'TRI')`, [pTri, idFisica])
    await c.query(
      `insert into nota (participacao_id, materia_id, valor_original, escala)
       values ($1, $2, 600, 'TRI')`, [pTri, idMatematica])
  } finally {
    await c.end()
  }
})

async function buscar(filtros) {
  const c = await conectar()
  try {
    const { rows } = await c.query(
      'select id from buscar_depoimentos($1::jsonb)', [JSON.stringify(filtros)])
    return rows.map((r) => Number(r.id))
  } finally { await c.end() }
}

describe('notas: N condicoes de percentual somadas (todas precisam bater)', () => {
  it('Fisica = 100 E Matematica >= 90: as duas batem, encontra', async () => {
    const achados = await buscar({
      notas: [
        { materia_id: idFisica, minimo: 100, operador: '=' },
        { materia_id: idMatematica, minimo: 90 },
      ],
    })
    expect(achados).toContain(Number(idDepoimento))
  })

  it('Fisica = 100 E Matematica >= 96: Matematica (92) nao bate, nao encontra', async () => {
    const achados = await buscar({
      notas: [
        { materia_id: idFisica, minimo: 100, operador: '=' },
        { materia_id: idMatematica, minimo: 96 },
      ],
    })
    expect(achados).not.toContain(Number(idDepoimento))
  })
})

describe('tri: N condicoes de TRI somadas (todas precisam bater)', () => {
  it('uma condicao satisfeita e outra nao: nao encontra', async () => {
    const achados = await buscar({
      tri: [
        { materia_id: idFisica, minimo: 500 },   // 550 >= 500: satisfeita
        { materia_id: idMatematica, minimo: 650 }, // 600 >= 650: NAO satisfeita
      ],
    })
    expect(achados).not.toContain(Number(idDepoimento))
  })

  it('as duas condicoes satisfeitas: encontra', async () => {
    const achados = await buscar({
      tri: [
        { materia_id: idFisica, minimo: 500 },
        { materia_id: idMatematica, minimo: 550 },
      ],
    })
    expect(achados).toContain(Number(idDepoimento))
  })
})

describe('contrato lib -> SQL: estado completo da UI encontra o fixture', () => {
  let idInstituicao, idProvaContrato, idDepoimentoContrato

  beforeAll(async () => {
    const c = await conectar()
    try {
      await c.query(
        `insert into membro_equipe (email, nome, ativo) values ($1, 'Membro Ativo', true)
         on conflict (email) do nothing`, [MEMBRO])

      idInstituicao = (await c.query(
        `insert into instituicao (nome_canonico) values ('Instituicao Contrato Lib')
         on conflict (nome_canonico) do update set nome_canonico = excluded.nome_canonico
         returning id`)).rows[0].id

      idProvaContrato = (await c.query(
        `insert into prova (nome) values ('Prova Contrato Lib')
         on conflict (nome) do update set nome = excluded.nome
         returning id`)).rows[0].id

      idDepoimentoContrato = (await c.query(
        `insert into depoimento (texto_completo, fonte)
         values ($1, 'GOOGLE_REVIEW') returning id`,
        [`Depoimento ${MARCADOR_CONTRATO} passa por toda a lib de filtros`],
      )).rows[0].id

      await c.query(
        `insert into depoimento_tipo (depoimento_id, tipo) values ($1, 'APROVACAO')
         on conflict do nothing`, [idDepoimentoContrato])
      await c.query(
        `insert into depoimento_canal (depoimento_id, canal) values ($1, 'SUPERIORES')
         on conflict do nothing`, [idDepoimentoContrato])

      // Participacao dentro da faixa anoDe..anoAte, com aprovacao na
      // instituicao e nota percentual "=".
      const pAprovacao = (await c.query(
        `insert into participacao (depoimento_id, prova_id, ano)
         values ($1, $2, 2024) returning id`, [idDepoimentoContrato, idProvaContrato])).rows[0].id
      await c.query(
        `insert into resultado (participacao_id, instituicao_id, situacao)
         values ($1, $2, 'APROVADO')`, [pAprovacao, idInstituicao])
      await c.query(
        `insert into nota (participacao_id, materia_id, valor_original, escala)
         values ($1, $2, 100, 'PERCENTUAL')`, [pAprovacao, idFisica])

      // Participacao separada com nota TRI.
      const pTriContrato = (await c.query(
        `insert into participacao (depoimento_id, prova_id, ano)
         values ($1, $2, 2025) returning id`, [idDepoimentoContrato, idProvaContrato])).rows[0].id
      await c.query(
        `insert into nota (participacao_id, materia_id, valor_original, escala)
         values ($1, $2, 700, 'TRI')`, [pTriContrato, idMatematica])
    } finally {
      await c.end()
    }
  })

  function montarEstadoCompleto() {
    return {
      ...ESTADO_VAZIO,
      aba: 'GOOGLE_REVIEW',
      texto: MARCADOR_CONTRATO,
      tipos: ['APROVACAO'],
      canais: ['SUPERIORES'],
      instituicoes: [idInstituicao],
      anoDe: 2024,
      anoAte: 2025,
      notas: [{ materia_id: idFisica, minimo: 100, familia: 'PERCENTUAL', operador: '=' }],
      temPrint: false,
    }
  }

  it('montarFiltros(estado) enviado direto encontra o fixture, como membro', async () => {
    const estado = { ...montarEstadoCompleto(), notas: [
      ...montarEstadoCompleto().notas,
      { materia_id: idMatematica, minimo: 650, familia: 'TRI' },
    ] }
    const filtros = montarFiltros(estado)

    const achados = await comoUsuario(MEMBRO, (c) =>
      c.query('select id from buscar_depoimentos($1::jsonb)', [JSON.stringify(filtros)])
        .then((r) => r.rows.map((row) => Number(row.id))))

    expect(achados).toContain(Number(idDepoimentoContrato))
  })

  it('filtrosParaUrl -> urlParaFiltros -> montarFiltros produz o mesmo objeto que montarFiltros direto', () => {
    const estado = montarEstadoCompleto()
    const direto = montarFiltros(estado)
    const viaUrl = montarFiltros(urlParaFiltros(filtrosParaUrl(estado)))
    expect(viaUrl).toEqual(direto)
  })
})
