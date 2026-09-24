import { describe, it, expect } from 'vitest'
import { conectar } from './ajuda.js'

// Corrida entre remover_instituicao e um INSERT concorrente em prova (FK
// "on delete set null", 0014, fix round 1). Sem trava, a contagem de uso é
// um SELECT comum sob READ COMMITTED: se o INSERT concorrente comita DEPOIS
// da contagem mas ANTES do DELETE, a contagem não o vê — a instituição seria
// apagada e a prova nova ficaria com instituicao_id nulo em silêncio, o que
// a regra do dono proíbe. O SELECT ... FOR UPDATE no topo da função tranca a
// linha da instituição; o INSERT de prova precisa de um lock FOR KEY SHARE
// na MESMA linha (comportamento do verificador de integridade referencial
// do Postgres, não algo que a função controla), e FOR UPDATE conflita com
// FOR KEY SHARE — então uma transação bloqueia a outra, nunca as duas
// passam batendo às cegas.
//
// Duas conexões reais (não savepoint numa só, como os outros testes deste
// arquivo): a instituição é criada e commitada ANTES da corrida (senão a
// conexão B nunca a enxergaria); a limpeza é manual no final.
//
// Deterministico via Promise.race contra um timeout curto: não dá para
// "esperar a trava" diretamente (bloquear é a ausência de um evento), então
// medimos que a chamada de B ainda não resolveu passado um tempo generoso
// (500ms) enquanto A segura o INSERT sem commitar — e só resolve (rejeitando
// com a mensagem "em uso") depois que A comita.

const M = 'MARCADORREMOVERCORRIDA'

function comTimeout(promessa, ms) {
  const resultado = promessa.then(
    (valor) => ({ resolvida: true, valor }),
    (erro) => ({ resolvida: true, erro }),
  )
  return Promise.race([
    resultado,
    new Promise((resolve) => setTimeout(() => resolve({ resolvida: false }), ms)),
  ])
}

// A prova comita de verdade (o commit de A no meio do teste é exatamente o
// que destrava B) — a limpeza tem de apagar a prova ANTES da instituicao
// (senão "on delete set null" só desliga a referência e a prova de teste
// fica órfã, poluindo os outros arquivos que também usam prova.nome).
async function limpar() {
  const c = await conectar()
  try {
    await c.query('delete from prova where nome like $1', [`%${M}%`])
    await c.query('delete from instituicao where nome_canonico like $1', [`%${M}%`])
  } finally {
    await c.end()
  }
}

describe('remover_instituicao sob escrita concorrente', () => {
  it('trava a instituicao: INSERT concorrente em prova é visto antes do DELETE, e a remocao recusa', async () => {
    const setup = await conectar()
    let id
    try {
      id = (await setup.query(
        `insert into instituicao (nome_canonico) values ($1) returning id`,
        [`Corrida ${M}`])).rows[0].id
    } finally {
      await setup.end()
    }

    const a = await conectar()
    const b = await conectar()
    try {
      await a.query('begin')
      await a.query('insert into prova (nome, instituicao_id) values ($1, $2)', [`Prova ${M}`, id])
      // Não comita: o INSERT já tirou o lock FOR KEY SHARE na linha da
      // instituição, e continua segurando até o commit abaixo.

      await b.query('begin')
      const chamadaB = b.query('select public.remover_instituicao($1)', [id])
      chamadaB.catch(() => {}) // evita unhandledRejection antes do await final

      const antesDoCommit = await comTimeout(chamadaB, 500)
      expect(antesDoCommit.resolvida, 'a chamada de B ainda deveria estar bloqueada pelo FOR UPDATE').toBe(false)

      await a.query('commit')

      const depoisDoCommit = await comTimeout(chamadaB, 5000)
      expect(depoisDoCommit.resolvida, 'B deveria destravar e terminar (com erro) apos o commit de A').toBe(true)
      expect(depoisDoCommit.erro).toBeTruthy()
      expect(depoisDoCommit.erro.message).toMatch(/está em uso em 1 prova\(s\)/)
    } finally {
      await a.query('rollback').catch(() => {})
      await b.query('rollback').catch(() => {})
      await a.end()
      await b.end()
      await limpar()
    }
  }, 15000)
})
