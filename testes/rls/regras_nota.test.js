import { describe, it, expect, beforeAll } from 'vitest'
import { conectar } from './ajuda.js'

let idDepoimento, idParticipacao, idMateria, idInstituicao

beforeAll(async () => {
  const c = await conectar()
  try {
    const dep = await c.query(
      `insert into depoimento (texto_completo, fonte)
       values ('Gabaritei fisica', 'MANUAL') returning id`)
    idDepoimento = dep.rows[0].id
    const prova = await c.query(
      `insert into prova (nome) values ('ENEM')
       on conflict (nome) do update set nome = excluded.nome
       returning id`)
    const part = await c.query(
      `insert into participacao (depoimento_id, prova_id, ano)
       values ($1, $2, 2025) returning id`, [idDepoimento, prova.rows[0].id])
    idParticipacao = part.rows[0].id
    const mat = await c.query(
      `insert into materia (nome) values ('Fisica')
       on conflict (nome) do update set nome = excluded.nome
       returning id`)
    idMateria = mat.rows[0].id
    const inst = await c.query(
      `insert into instituicao (nome_canonico) values ('UFMG')
       on conflict (nome_canonico) do update set nome_canonico = excluded.nome_canonico
       returning id`)
    idInstituicao = inst.rows[0].id
  } finally {
    await c.end()
  }
})

async function inserirNota(campos) {
  const c = await conectar()
  try {
    return await c.query(
      `insert into nota (participacao_id, materia_id, valor_original, escala, valor_maximo)
       values ($1, $2, $3, $4, $5) returning percentual`,
      [idParticipacao, idMateria, campos.valor, campos.escala, campos.maximo ?? null])
  } finally { await c.end() }
}

describe('nota', () => {
  it('regra 2: PONTOS sem maximo e recusado', async () => {
    await expect(inserirNota({ valor: 18, escala: 'PONTOS' }))
      .rejects.toThrow(/ck_pontos_exige_maximo/)
  })

  it('PERCENTUAL: percentual e o proprio valor', async () => {
    const r = await inserirNota({ valor: 100, escala: 'PERCENTUAL' })
    expect(Number(r.rows[0].percentual)).toBe(100)
  })

  it('PONTOS: 18 de 20 vira 90', async () => {
    const r = await inserirNota({ valor: 18, escala: 'PONTOS', maximo: 20 })
    expect(Number(r.rows[0].percentual)).toBe(90)
  })

  it('TRI: nunca vira percentual', async () => {
    const r = await inserirNota({ valor: 820, escala: 'TRI' })
    expect(r.rows[0].percentual).toBeNull()
  })

  it('percentual nao pode ser escrito por codigo', async () => {
    const c = await conectar()
    try {
      await expect(
        c.query(`insert into nota
          (participacao_id, materia_id, valor_original, escala, percentual)
          values ($1, $2, 50, 'PERCENTUAL', 99)`, [idParticipacao, idMateria])
      ).rejects.toThrow(/cannot insert a non-DEFAULT value into column "percentual"/)
    } finally {
      await c.end()
    }
  })
})

describe('resultado', () => {
  it('regra 3: APROVADO sem instituicao e recusado', async () => {
    const c = await conectar()
    try {
      await expect(
        c.query(`insert into resultado (participacao_id, situacao)
                 values ($1, 'APROVADO')`, [idParticipacao])
      ).rejects.toThrow(/ck_aprovado_exige_instituicao/)
    } finally {
      await c.end()
    }
  })

  it('NAO_APROVADO sem instituicao e aceito', async () => {
    const c = await conectar()
    try {
      const r = await c.query(
        `insert into resultado (participacao_id, situacao)
         values ($1, 'NAO_APROVADO') returning id`, [idParticipacao])
      expect(r.rows[0].id).toBeDefined()
    } finally {
      await c.end()
    }
  })

  it('uma participacao aceita varios resultados', async () => {
    const c = await conectar()
    try {
      const r = await c.query(
        `insert into resultado (participacao_id, instituicao_id, situacao)
         values ($1, $2, 'APROVADO') returning id`, [idParticipacao, idInstituicao])
      expect(r.rows[0].id).toBeDefined()
    } finally {
      await c.end()
    }
  })
})
