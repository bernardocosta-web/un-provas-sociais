import { describe, it, expect, beforeAll } from 'vitest'
import { conectar, comoUsuario } from './ajuda.js'

// Complemento de privilegios.test.js (varredura de catalogo): aqui, a prova
// de comportamento de que o app continua funcionando sob os privilegios
// minimos da 0011 — authenticated sem USAGE nas sequencias e sem EXECUTE nas
// funcoes de trigger. Tudo roda dentro da transacao de comoUsuario, que e
// desfeita no fim: nenhum teste deixa linha no banco.

const MEMBRO = 'membro@exemplo.test'

beforeAll(async () => {
  // Fixture compartilhada e idempotente (mesmo membro dos outros arquivos).
  const c = await conectar()
  try {
    await c.query(
      `insert into membro_equipe (email, nome, ativo) values ($1, 'Membro Ativo', true)
       on conflict (email) do nothing`, [MEMBRO])
  } finally {
    await c.end()
  }
})

const inserirDepoimento = (c, texto) => c.query(
  `insert into depoimento (texto_completo, fonte) values ($1, 'MANUAL') returning id`,
  [texto]).then((r) => r.rows[0].id)

describe('o app continua funcionando sob os privilegios minimos', () => {
  it('membro insere em tabela com identidade sem privilegio na sequencia', async () => {
    const linhas = await comoUsuario(MEMBRO, (c) => c.query(
      `insert into instituicao (nome_canonico) values ('SONDA PRIVILEGIO') returning id`)
      .then((r) => r.rows))
    expect(linhas.length).toBe(1)
  })

  it('trigger de atualizado_em dispara para authenticated', async () => {
    // now() e fixo dentro da transacao, entao "avancou" nao serve aqui. Em
    // vez disso o update tenta gravar um valor antigo: so o trigger o troca
    // por now().
    const linha = await comoUsuario(MEMBRO, async (c) => {
      const id = await inserirDepoimento(c, 'Sonda privilegio')
      const r = await c.query(
        `update depoimento set atualizado_em = '2000-01-01T00:00:00Z' where id = $1
         returning atualizado_em = now() as tocado`, [id])
      return r.rows[0]
    })
    expect(linha).toEqual({ tocado: true })
  })

  it('trigger de transicao dispara para authenticated', async () => {
    await expect(comoUsuario(MEMBRO, async (c) => {
      const id = await inserirDepoimento(c, 'Sonda transicao')
      await c.query(`update depoimento set status_uso = 'FEITO' where id = $1`, [id])
    })).rejects.toThrow(/transicao de status invalida: DISPONIVEL -> FEITO/)
  })
})
