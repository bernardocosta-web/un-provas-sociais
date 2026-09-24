import { describe, it, expect, beforeAll } from 'vitest'
import { conectar } from './ajuda.js'

// Fix round 1 da Task 11 (achados do coordenador sobre 0010_busca.sql):
// 1) chave com "null" explicito no JSON tem de se comportar como ausente
//    (hoje: escalar vira 0 linhas em silencio, array lanca erro de extracao);
// 2) lista vazia [] tem de significar "nao filtra" em toda familia;
// 3) texto e busca literal: % _ e \ nao podem agir como coringa do ILIKE;
// 4) funcao roda com search_path vazio (tabelas qualificadas por public.);
// 5) operador de percentual ('=' | '>=', invalido lanca excecao) e faixa
//    de ano (ano_de/ano_ate, inclusiva).
// Fixture propria, marcador unico, para nao colidir com outros arquivos.

const MARCADOR = 'MARCADORFIX1BUSCA'
const MARCADOR_FAIXA = 'MARCADORFIX1FAIXADOISANOS'

let idDepoimento, idFisica, idDepoimentoFaixa

beforeAll(async () => {
  const c = await conectar()
  try {
    idFisica = (await c.query(
      `insert into materia (nome) values ('Fisica')
       on conflict (nome) do update set nome = excluded.nome
       returning id`)).rows[0].id
    const enem = (await c.query(
      `insert into prova (nome) values ('ENEM')
       on conflict (nome) do update set nome = excluded.nome
       returning id`)).rows[0].id

    // Texto com "AXB" (para o teste de "_" nao ser coringa) e uma barra
    // invertida literal (para o teste de "\" nao ser coringa).
    idDepoimento = (await c.query(
      `insert into depoimento (texto_completo, fonte)
       values ($1, 'MANUAL') returning id`,
      [`Depoimento ${MARCADOR} com nota AXB especial, caminho C:\\prova`])).rows[0].id

    const p = (await c.query(
      `insert into participacao (depoimento_id, prova_id, ano)
       values ($1, $2, 2025) returning id`, [idDepoimento, enem])).rows[0].id
    await c.query(
      `insert into nota (participacao_id, materia_id, valor_original, escala)
       values ($1, $2, 100, 'PERCENTUAL')`, [p, idFisica])

    // Depoimento separado com DUAS participacoes, uma de cada lado de uma
    // faixa 2024..2025: prova de que ano_de/ano_ate tem de ser satisfeito
    // por UMA UNICA participacao, nao por duas participacoes diferentes
    // cobrindo os dois lados da faixa.
    idDepoimentoFaixa = (await c.query(
      `insert into depoimento (texto_completo, fonte)
       values ($1, 'MANUAL') returning id`,
      [`Depoimento ${MARCADOR_FAIXA} com participacoes em 2023 e 2026`])).rows[0].id
    await c.query(
      `insert into participacao (depoimento_id, prova_id, ano)
       values ($1, $2, 2023)`, [idDepoimentoFaixa, enem])
    await c.query(
      `insert into participacao (depoimento_id, prova_id, ano)
       values ($1, $2, 2026)`, [idDepoimentoFaixa, enem])
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

describe('null explicito == ausente (nunca 0 linhas em silencio, nunca erro)', () => {
  it('sem filtro algum encontra (controle)', async () => {
    expect(await buscar({})).toContain(Number(idDepoimento))
  })

  it('todo campo com null explicito encontra igual a {}', async () => {
    const filtros = {
      texto: null, fontes: null, status: null, tipos: null, canais: null,
      ano: null, ano_de: null, ano_ate: null, provas: null,
      instituicoes: null, cursos: null, notas: null, tri: null, tem_print: null,
    }
    expect(await buscar(filtros)).toContain(Number(idDepoimento))
  })

  it('texto null (escalar) nao vira "nao encontra nada" em silencio', async () => {
    expect(await buscar({ texto: null })).toContain(Number(idDepoimento))
  })

  it('tipos null (array) nao lanca "cannot extract elements from a scalar"', async () => {
    expect(await buscar({ tipos: null })).toContain(Number(idDepoimento))
  })

  it('buscar_depoimentos(null) (parametro SQL null, nao json null) funciona', async () => {
    const c = await conectar()
    try {
      const { rows } = await c.query(
        'select id from buscar_depoimentos($1::jsonb)', [null])
      expect(rows.map((r) => Number(r.id))).toContain(Number(idDepoimento))
    } finally { await c.end() }
  })
})

describe('lista vazia == ausente, em toda familia', () => {
  it.each([
    ['tipos'], ['fontes'], ['status'], ['canais'],
    ['provas'], ['instituicoes'], ['cursos'], ['notas'], ['tri'],
  ])('%s: [] nao filtra', async (campo) => {
    expect(await buscar({ [campo]: [] })).toContain(Number(idDepoimento))
  })
})

describe('texto e busca literal, nao padrao ILIKE', () => {
  it('ainda encontra o marcador normal (controle)', async () => {
    expect(await buscar({ texto: MARCADOR })).toContain(Number(idDepoimento))
  })

  it('% nao age como coringa: nao bate sem % literal no texto', async () => {
    expect(await buscar({ texto: '%' })).not.toContain(Number(idDepoimento))
  })

  it('_ nao age como coringa: "A_B" nao bate em "AXB"', async () => {
    expect(await buscar({ texto: 'A_B' })).not.toContain(Number(idDepoimento))
  })

  it('\\ literal no texto e tratado como caractere, nao como escape do ILIKE', async () => {
    expect(await buscar({ texto: 'C:\\prova' })).toContain(Number(idDepoimento))
  })
})

describe('funcao roda com search_path vazio', () => {
  it('proconfig tem search_path=""', async () => {
    const c = await conectar()
    try {
      const { rows } = await c.query(`
        select proconfig from pg_proc
        where proname = 'buscar_depoimentos' and pronamespace = 'public'::regnamespace
      `)
      expect(rows[0].proconfig).toContain('search_path=""')
    } finally { await c.end() }
  })
})

describe('operador de percentual', () => {
  it('"=" bate quando o percentual e exatamente o minimo', async () => {
    expect(await buscar({ notas: [{ materia_id: idFisica, minimo: 100, operador: '=' }] }))
      .toContain(Number(idDepoimento))
  })

  it('"=" nao bate quando o percentual e maior que o minimo', async () => {
    expect(await buscar({ notas: [{ materia_id: idFisica, minimo: 90, operador: '=' }] }))
      .not.toContain(Number(idDepoimento))
  })

  it('">=" (padrao explicito) bate quando o percentual e maior', async () => {
    expect(await buscar({ notas: [{ materia_id: idFisica, minimo: 90, operador: '>=' }] }))
      .toContain(Number(idDepoimento))
  })

  it('operador invalido lanca excecao com causa clara', async () => {
    await expect(buscar({
      notas: [{ materia_id: idFisica, minimo: 100, operador: '<>' }],
    })).rejects.toThrow(/operador invalido/)
  })
})

describe('faixa de ano (ano_de / ano_ate, inclusiva)', () => {
  it('faixa que cobre o ano da participacao encontra', async () => {
    expect(await buscar({ ano_de: 2024, ano_ate: 2025 })).toContain(Number(idDepoimento))
  })

  it('faixa que nao cobre o ano da participacao nao encontra', async () => {
    expect(await buscar({ ano_de: 2026, ano_ate: 2027 })).not.toContain(Number(idDepoimento))
  })

  it('so ano_de, satisfeito, encontra', async () => {
    expect(await buscar({ ano_de: 2025 })).toContain(Number(idDepoimento))
  })

  it('so ano_ate, nao satisfeito, nao encontra', async () => {
    expect(await buscar({ ano_ate: 2024 })).not.toContain(Number(idDepoimento))
  })

  it('a faixa tem de ser satisfeita por UMA participacao, nao por duas diferentes', async () => {
    // idDepoimentoFaixa tem participacoes em 2023 e 2026: nenhuma das duas,
    // sozinha, cai em 2024..2025. Uma implementacao que checasse ano_de e
    // ano_ate em EXISTS separados (em vez de um so, sobre a mesma linha de
    // participacao) encontraria por engano, combinando as duas.
    expect(await buscar({ ano_de: 2024, ano_ate: 2025 }))
      .not.toContain(Number(idDepoimentoFaixa))
  })
})
