import { describe, it, expect } from 'vitest'
import { conectar } from './ajuda.js'

// Arquivo separado de regras_depoimento.test.js: o trigger e generico (nao
// e uma regra de negocio do depoimento) e o teste de catalogo abaixo cobre
// qualquer tabela futura com atualizado_em, entao agrupar aqui evita que
// regras_depoimento.test.js cresca com algo que nao e regra de depoimento.

async function inserirDepoimento() {
  const c = await conectar()
  try {
    // ::text preserva microssegundos; o driver pg converteria timestamptz
    // para JS Date, que trunca em milissegundos e pode igualar dois
    // timestamps que no Postgres sao diferentes.
    const r = await c.query(
      `insert into depoimento (texto_completo, fonte)
       values ('Gabaritei fisica', 'MANUAL')
       returning id, atualizado_em::text as atualizado_em`)
    return r.rows[0]
  } finally {
    await c.end()
  }
}

describe('atualizado_em', () => {
  it('um update que nao mexe em atualizado_em avanca o valor', async () => {
    // now() e fixo dentro de uma transacao; insert e update em conexoes
    // separadas garantem timestamps distintos. A comparacao "antes < agora"
    // roda inteira no Postgres (timestamptz, precisao de microssegundos),
    // sem passar pelo JS Date — que truncaria em milissegundos e poderia
    // mascarar um avanco real como se nao tivesse acontecido.
    const inserido = await inserirDepoimento()

    const c = await conectar()
    let avancou
    try {
      const r = await c.query(
        `update depoimento set texto_completo = 'Gabaritei fisica e quimica'
         where id = $1
         returning atualizado_em > $2::timestamptz as avancou`,
        [inserido.id, inserido.atualizado_em])
      avancou = r.rows[0].avancou
    } finally {
      await c.end()
    }

    expect(avancou).toBe(true)
  })

  it('um update que tenta gravar atualizado_em antigo termina com o valor do trigger', async () => {
    const inserido = await inserirDepoimento()

    const c = await conectar()
    let avancou
    try {
      const r = await c.query(
        `update depoimento set atualizado_em = '2000-01-01T00:00:00Z'
         where id = $1
         returning atualizado_em > $2::timestamptz as avancou`,
        [inserido.id, inserido.atualizado_em])
      avancou = r.rows[0].avancou
    } finally {
      await c.end()
    }

    expect(avancou).toBe(true)
  })
})
