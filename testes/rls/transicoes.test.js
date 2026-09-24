import { describe, it, expect } from 'vitest'
import { conectar } from './ajuda.js'

const ESTADOS = ['DISPONIVEL', 'EM_PRODUCAO', 'FEITO', 'POSTADO', 'DESCARTADO']

const PERMITIDAS = new Set([
  'DISPONIVEL>EM_PRODUCAO',
  'EM_PRODUCAO>FEITO',
  'EM_PRODUCAO>DISPONIVEL',
  'FEITO>POSTADO',
  'FEITO>EM_PRODUCAO',
  'POSTADO>FEITO',
  'DISPONIVEL>DESCARTADO',
  'EM_PRODUCAO>DESCARTADO',
  'FEITO>DESCARTADO',
  'POSTADO>DESCARTADO',
  'DESCARTADO>DISPONIVEL',
])

// Campos que cada estado exige para existir, conforme as regras 4 e 6.
function camposDoEstado(estado) {
  if (estado === 'DESCARTADO') return { motivo_descarte: 'DUPLICADO', data_postagem: null }
  if (estado === 'POSTADO') return { motivo_descarte: null, data_postagem: '2026-09-01' }
  return { motivo_descarte: null, data_postagem: null }
}

// Decisao do controlador: um catch cego faria qualquer erro (typo, INSERT
// quebrado, CHECK disparado por engano) contar como "transicao recusada",
// e a matriz ficaria verde sem o trigger fazer nada. Aqui so a mensagem do
// trigger conta como recusa esperada; qualquer outro erro propaga e derruba
// o teste.
async function tentar(de, para) {
  const c = await conectar()
  try {
    const inicial = camposDoEstado(de)
    const final = camposDoEstado(para)
    const dep = await c.query(
      `insert into depoimento (texto_completo, fonte, status_uso, motivo_descarte, data_postagem)
       values ('texto', 'MANUAL', $1, $2, $3) returning id`,
      [de, inicial.motivo_descarte, inicial.data_postagem])
    await c.query(
      `update depoimento set status_uso = $1, motivo_descarte = $2, data_postagem = $3
       where id = $4`,
      [para, final.motivo_descarte, final.data_postagem, dep.rows[0].id])
    return true
  } catch (err) {
    if (err.code === '23514' && /transicao de status invalida/.test(err.message)) {
      return false
    }
    throw err
  } finally {
    await c.end()
  }
}

describe('transicoes de status', () => {
  for (const de of ESTADOS) {
    for (const para of ESTADOS) {
      if (de === para) continue
      const chave = `${de}>${para}`
      const esperado = PERMITIDAS.has(chave)
      it(`${chave} ${esperado ? 'e permitida' : 'e recusada'}`, async () => {
        expect(await tentar(de, para)).toBe(esperado)
      })
    }
  }
})

describe('reversoes nomeadas', () => {
  it('EM_PRODUCAO volta para DISPONIVEL: arte abandonada libera o depoimento', async () => {
    expect(await tentar('EM_PRODUCAO', 'DISPONIVEL')).toBe(true)
  })

  it('DESCARTADO volta para DISPONIVEL limpando motivo', async () => {
    expect(await tentar('DESCARTADO', 'DISPONIVEL')).toBe(true)
  })

  it('DESCARTADO nao volta para DISPONIVEL com motivo preenchido', async () => {
    const c = await conectar()
    try {
      const dep = await c.query(
        `insert into depoimento (texto_completo, fonte, status_uso, motivo_descarte)
         values ('t', 'MANUAL', 'DESCARTADO', 'DUPLICADO') returning id`)
      await expect(
        c.query(`update depoimento set status_uso = 'DISPONIVEL' where id = $1`,
          [dep.rows[0].id])
      ).rejects.toThrow(/ck_descarte_motivo/)
    } finally {
      await c.end()
    }
  })
})
