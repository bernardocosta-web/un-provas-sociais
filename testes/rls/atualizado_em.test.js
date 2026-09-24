import { describe, it, expect } from 'vitest'
import { conectar } from './ajuda.js'

// Arquivo separado de regras_depoimento.test.js: o trigger e generico (nao
// e uma regra de negocio do depoimento) e o teste de catalogo abaixo cobre
// qualquer tabela futura com atualizado_em, entao agrupar aqui evita que
// regras_depoimento.test.js cresca com algo que nao e regra de depoimento.

async function inserirDepoimento() {
  const c = await conectar()
  try {
    const r = await c.query(
      `insert into depoimento (texto_completo, fonte)
       values ('Gabaritei fisica', 'MANUAL') returning id, atualizado_em`)
    return r.rows[0]
  } finally {
    await c.end()
  }
}

describe('atualizado_em', () => {
  it('um update que nao mexe em atualizado_em avanca o valor', async () => {
    // now() e fixo dentro de uma transacao; insert e update em conexoes
    // separadas garantem timestamps distintos.
    const inserido = await inserirDepoimento()

    const c = await conectar()
    let atualizado
    try {
      const r = await c.query(
        `update depoimento set texto_completo = 'Gabaritei fisica e quimica'
         where id = $1 returning atualizado_em`, [inserido.id])
      atualizado = r.rows[0].atualizado_em
    } finally {
      await c.end()
    }

    expect(new Date(atualizado).getTime())
      .toBeGreaterThan(new Date(inserido.atualizado_em).getTime())
  })

  it('um update que tenta gravar atualizado_em antigo termina com o valor do trigger', async () => {
    const inserido = await inserirDepoimento()

    const c = await conectar()
    let atualizado
    try {
      const r = await c.query(
        `update depoimento set atualizado_em = '2000-01-01T00:00:00Z'
         where id = $1 returning atualizado_em`, [inserido.id])
      atualizado = r.rows[0].atualizado_em
    } finally {
      await c.end()
    }

    expect(new Date(atualizado).getTime())
      .toBeGreaterThan(new Date(inserido.atualizado_em).getTime())
  })
})
