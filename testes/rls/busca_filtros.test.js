import { describe, it, expect, beforeAll } from 'vitest'
import { conectar, comoAnonimo, comoUsuario } from './ajuda.js'

// Complemento ao Step 1 da Task 11 (testes/rls/busca.test.js): a brief so
// exercita notas/instituicoes/ano. Aqui: prova da RLS dentro da funcao
// (SECURITY INVOKER) e um caso positivo + um negativo para cada familia de
// filtro restante. Fixture propria com marcador unico no texto para nao
// colidir com dados de outros arquivos de teste.

const MEMBRO = 'membro@exemplo.test'
const ESTRANHO = 'estranho@exemplo.test'
const MARCADOR = 'MARCADORFILTROBUSCA'

let idDepoimento, idMatematica, idProvaFiltro, idProvaNuncaUsada,
  idCursoFiltro, idCursoNuncaUsado

beforeAll(async () => {
  const c = await conectar()
  try {
    await c.query(
      `insert into membro_equipe (email, nome, ativo) values ($1, 'Membro Ativo', true)
       on conflict (email) do nothing`, [MEMBRO])

    idMatematica = (await c.query(
      `insert into materia (nome) values ('Matematica')
       on conflict (nome) do update set nome = excluded.nome
       returning id`)).rows[0].id

    const enem = (await c.query(
      `insert into prova (nome) values ('ENEM')
       on conflict (nome) do update set nome = excluded.nome
       returning id`)).rows[0].id

    idProvaFiltro = (await c.query(
      `insert into prova (nome) values ('Prova Filtro Busca')
       on conflict (nome) do update set nome = excluded.nome
       returning id`)).rows[0].id

    idProvaNuncaUsada = (await c.query(
      `insert into prova (nome) values ('Prova Nunca Usada Busca')
       on conflict (nome) do update set nome = excluded.nome
       returning id`)).rows[0].id

    idCursoFiltro = (await c.query(
      `insert into curso (nome) values ('Curso Filtro Busca')
       on conflict (nome) do update set nome = excluded.nome
       returning id`)).rows[0].id

    idCursoNuncaUsado = (await c.query(
      `insert into curso (nome) values ('Curso Nunca Usado Busca')
       on conflict (nome) do update set nome = excluded.nome
       returning id`)).rows[0].id

    idDepoimento = (await c.query(
      `insert into depoimento (texto_completo, fonte)
       values ($1, 'GOOGLE_REVIEW') returning id`,
      [`Depoimento de teste ${MARCADOR} para filtros de busca`])).rows[0].id

    await c.query(
      `insert into depoimento_tipo (depoimento_id, tipo) values ($1, 'APROVACAO')
       on conflict do nothing`, [idDepoimento])
    await c.query(
      `insert into depoimento_canal (depoimento_id, canal) values ($1, 'MILITARES')
       on conflict do nothing`, [idDepoimento])

    // Participacao 1: prova + curso (situacao NAO_APROVADO evita ter de
    // amarrar instituicao so para satisfazer ck_aprovado_exige_instituicao).
    const pProva = (await c.query(
      `insert into participacao (depoimento_id, prova_id, ano)
       values ($1, $2, 2024) returning id`, [idDepoimento, idProvaFiltro])).rows[0].id
    await c.query(
      `insert into resultado (participacao_id, curso_id, situacao)
       values ($1, $2, 'NAO_APROVADO')`, [pProva, idCursoFiltro])

    // Participacao 2: nota TRI (nunca vira percentual, familia propria).
    const pTri = (await c.query(
      `insert into participacao (depoimento_id, prova_id, ano)
       values ($1, $2, 2025) returning id`, [idDepoimento, enem])).rows[0].id
    await c.query(
      `insert into nota (participacao_id, materia_id, valor_original, escala)
       values ($1, $2, 950, 'TRI')`, [pTri, idMatematica])
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

async function buscarComoPapel(comoPapel, filtros) {
  return comoPapel((c) =>
    c.query('select id from buscar_depoimentos($1::jsonb)', [JSON.stringify(filtros)])
      .then((r) => r.rows.map((row) => Number(row.id))))
}

describe('buscar_depoimentos e SECURITY INVOKER: RLS continua valendo dentro da funcao', () => {
  it('anonimo nao encontra nada', async () => {
    expect(await buscarComoPapel(comoAnonimo, {})).toEqual([])
  })

  it('logado fora da equipe nao encontra nada', async () => {
    expect(await buscarComoPapel((fn) => comoUsuario(ESTRANHO, fn), {})).toEqual([])
  })

  it('membro ativo encontra o depoimento de teste', async () => {
    const achados = await buscarComoPapel((fn) => comoUsuario(MEMBRO, fn), {})
    expect(achados).toContain(Number(idDepoimento))
  })
})

describe('filtros restantes: um caso positivo e um negativo por familia', () => {
  it('texto: bate case-insensitive em texto_completo', async () => {
    expect(await buscar({ texto: MARCADOR.toLowerCase() })).toContain(Number(idDepoimento))
  })
  it('texto: nao bate com string ausente no texto', async () => {
    expect(await buscar({ texto: 'STRINGQUENUNCAAPARECENESTEBANCO' }))
      .not.toContain(Number(idDepoimento))
  })

  it('fontes: bate com a fonte do depoimento', async () => {
    expect(await buscar({ fontes: ['GOOGLE_REVIEW'] })).toContain(Number(idDepoimento))
  })
  it('fontes: nao bate com outra fonte', async () => {
    expect(await buscar({ fontes: ['GOOGLE_FORMS'] })).not.toContain(Number(idDepoimento))
  })

  it('status: bate com o status default DISPONIVEL', async () => {
    expect(await buscar({ status: ['DISPONIVEL'] })).toContain(Number(idDepoimento))
  })
  it('status: nao bate com outro status', async () => {
    expect(await buscar({ status: ['POSTADO'] })).not.toContain(Number(idDepoimento))
  })

  it('tipos: bate com o tipo cadastrado', async () => {
    expect(await buscar({ tipos: ['APROVACAO'] })).toContain(Number(idDepoimento))
  })
  it('tipos: nao bate com tipo nao cadastrado para este depoimento', async () => {
    expect(await buscar({ tipos: ['ELOGIO'] })).not.toContain(Number(idDepoimento))
  })

  it('canais: bate com o canal cadastrado', async () => {
    expect(await buscar({ canais: ['MILITARES'] })).toContain(Number(idDepoimento))
  })
  it('canais: nao bate com canal nao cadastrado para este depoimento', async () => {
    expect(await buscar({ canais: ['SUPERIORES'] })).not.toContain(Number(idDepoimento))
  })

  it('provas: bate com a prova da participacao', async () => {
    expect(await buscar({ provas: [idProvaFiltro] })).toContain(Number(idDepoimento))
  })
  it('provas: nao bate com prova nunca usada por este depoimento', async () => {
    expect(await buscar({ provas: [idProvaNuncaUsada] })).not.toContain(Number(idDepoimento))
  })

  it('cursos: bate com o curso do resultado', async () => {
    expect(await buscar({ cursos: [idCursoFiltro] })).toContain(Number(idDepoimento))
  })
  it('cursos: nao bate com curso nunca usado por este depoimento', async () => {
    expect(await buscar({ cursos: [idCursoNuncaUsado] })).not.toContain(Number(idDepoimento))
  })

  it('tri: minimo satisfeito encontra', async () => {
    expect(await buscar({ tri: [{ materia_id: idMatematica, minimo: 900 }] }))
      .toContain(Number(idDepoimento))
  })
  it('tri: minimo nao satisfeito nao encontra', async () => {
    expect(await buscar({ tri: [{ materia_id: idMatematica, minimo: 960 }] }))
      .not.toContain(Number(idDepoimento))
  })
  it('tri e percentual nunca se misturam: filtro de nota nao enxerga a nota TRI', async () => {
    expect(await buscar({ notas: [{ materia_id: idMatematica, minimo: 1 }] }))
      .not.toContain(Number(idDepoimento))
  })

  it('tem_print: false bate quando o depoimento nao tem print', async () => {
    expect(await buscar({ tem_print: false })).toContain(Number(idDepoimento))
  })
  it('tem_print: true nao bate quando o depoimento nao tem print', async () => {
    expect(await buscar({ tem_print: true })).not.toContain(Number(idDepoimento))
  })
})
