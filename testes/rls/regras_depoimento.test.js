import { describe, it, expect } from 'vitest'
import { conectar } from './ajuda.js'

async function inserir(campos) {
  const cliente = await conectar()
  try {
    const colunas = Object.keys(campos)
    const marcadores = colunas.map((_, i) => `$${i + 1}`)
    return await cliente.query(
      `insert into depoimento (${colunas.join(',')})
       values (${marcadores.join(',')}) returning id`,
      Object.values(campos))
  } finally {
    await cliente.end()
  }
}

const BASE = { texto_completo: 'Passei no ITA!', fonte: 'MANUAL' }

describe('regras do depoimento', () => {
  it('regra 1: texto vazio e recusado', async () => {
    await expect(inserir({ ...BASE, texto_completo: '   ' }))
      .rejects.toThrow(/ck_texto_nao_vazio/)
  })

  it('regra 4: descartado sem motivo e recusado', async () => {
    await expect(inserir({ ...BASE, status_uso: 'DESCARTADO' }))
      .rejects.toThrow(/ck_descarte_motivo/)
  })

  it('regra 4 ao contrario: motivo em depoimento nao descartado e recusado', async () => {
    await expect(
      inserir({ ...BASE, status_uso: 'DISPONIVEL', motivo_descarte: 'DUPLICADO' })
    ).rejects.toThrow(/ck_descarte_motivo/)
  })

  it('regra 4, parte da observacao: observacao em depoimento nao descartado e recusada', async () => {
    await expect(
      inserir({ ...BASE, status_uso: 'DISPONIVEL', observacao_descarte: 'sobrou da reversao' })
    ).rejects.toThrow(/ck_descarte_observacao/)
  })

  it('regra 5: motivo OUTRO sem observacao e recusado', async () => {
    await expect(
      inserir({ ...BASE, status_uso: 'DESCARTADO', motivo_descarte: 'OUTRO' })
    ).rejects.toThrow(/ck_motivo_outro/)
  })

  it('regra 6: POSTADO sem data e recusado', async () => {
    await expect(inserir({ ...BASE, status_uso: 'POSTADO' }))
      .rejects.toThrow(/ck_postado_data/)
  })

  it('regra 6: POSTADO sem link e aceito', async () => {
    const r = await inserir({
      ...BASE, status_uso: 'POSTADO', data_postagem: '2026-09-01',
    })
    expect(r.rows[0].id).toBeDefined()
  })

  it('regra 7: NAO_AUTORIZADO como DISPONIVEL e recusado', async () => {
    await expect(
      inserir({ ...BASE, autorizacao_publicacao: 'NAO_AUTORIZADO' })
    ).rejects.toThrow(/ck_autorizacao/)
  })

  it('regra 7: NAO_AUTORIZADO so vive como DESCARTADO/SEM_AUTORIZACAO', async () => {
    const r = await inserir({
      ...BASE,
      autorizacao_publicacao: 'NAO_AUTORIZADO',
      status_uso: 'DESCARTADO',
      motivo_descarte: 'SEM_AUTORIZACAO',
    })
    expect(r.rows[0].id).toBeDefined()
  })

  it('regra 7 operacional: mudar so a autorizacao falha', async () => {
    const r = await inserir(BASE)
    const cliente = await conectar()
    try {
      await expect(
        cliente.query(
          `update depoimento set autorizacao_publicacao = 'NAO_AUTORIZADO' where id = $1`,
          [r.rows[0].id])
      ).rejects.toThrow(/ck_autorizacao/)
    } finally {
      await cliente.end()
    }
  })
})
