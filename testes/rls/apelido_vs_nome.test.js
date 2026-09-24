import { describe, it, expect, beforeAll } from 'vitest'
import { conectar, comoUsuario } from './ajuda.js'

// Apelido nao pode ser o nome canonico de OUTRA instituicao, nem o nome o
// apelido de outra (0013_apelido_vs_nome.sql). As checagens sao constraint
// triggers DEFERIDAS: so disparam no COMMIT. Cada teste roda numa transacao
// desfeita; para ver a checagem sem commitar, monta o cenario e faz `set
// constraints all immediate` (imediato()): os eventos pendentes disparam ali
// e, dali em diante, cada comando e checado na hora — o comando que viola a
// regra e o que falha, como aconteceria no COMMIT de uma transacao so dele.
// Escolha: comoUsuario sempre desfaz, entao so o "immediate" alcanca o caso
// do membro; e nao deixa lixo no banco. Dois testes fazem COMMIT de verdade,
// para provar que o caminho deferido (o que o PostgREST percorre) tambem
// recusa — e que a mesclagem, que depende do adiamento, passa.

const MEMBRO = 'membro@exemplo.test'
const M = 'MARCADORAPNOME'

async function inst(c, nome) {
  return (await c.query(
    'insert into instituicao (nome_canonico) values ($1) returning id', [nome])).rows[0].id
}

async function apelido(c, id, texto) {
  await c.query(
    'insert into instituicao_apelido (instituicao_id, apelido) values ($1, $2)', [id, texto])
}

const imediato = (c) => c.query('set constraints all immediate')

// Transacao de superusuario desfeita no fim.
async function emTransacao(executar) {
  const c = await conectar()
  try {
    await c.query('begin')
    await executar(c)
  } finally {
    await c.query('rollback').catch(() => {})
    await c.end()
  }
}

beforeAll(async () => {
  const c = await conectar()
  await c.query(
    `insert into membro_equipe (email, nome, ativo) values ($1, 'Membro Ativo', true)
     on conflict (email) do nothing`, [MEMBRO])
  await c.end()
})

describe('apelido x nome canonico de outra instituicao', () => {
  it('recusa apelido igual ao nome canonico de outra instituicao', () => emTransacao(async (c) => {
    await inst(c, `TESTE B ${M}1`)
    const t = await inst(c, `TESTE T ${M}1`)
    await imediato(c)
    await expect(apelido(c, t, `TESTE B ${M}1`)).rejects.toThrow(
      `o apelido "TESTE B ${M}1" já é o nome de outra instituição: "TESTE B ${M}1"`)
  }))

  it('recusa tambem com caixa e espacos nas pontas diferentes', () => emTransacao(async (c) => {
    await inst(c, `TESTE B ${M}2`)
    const t = await inst(c, `TESTE T ${M}2`)
    await imediato(c)
    await expect(apelido(c, t, `  teste b ${M.toLowerCase()}2 `)).rejects.toMatchObject({
      code: 'P0001',
      message: `o apelido "  teste b ${M.toLowerCase()}2 " já é o nome de outra instituição: "TESTE B ${M}2"`,
    })
  }))

  it('recusa trocar o texto de um apelido para o nome de outra', () => emTransacao(async (c) => {
    await inst(c, `TESTE B ${M}3`)
    const t = await inst(c, `TESTE T ${M}3`)
    await apelido(c, t, `Livre ${M}3`)
    await imediato(c)
    await expect(c.query('update instituicao_apelido set apelido = $1 where apelido = $2',
      [`TESTE B ${M}3`, `Livre ${M}3`])).rejects.toThrow('já é o nome de outra instituição')
  }))

  it('recusa nome canonico novo igual a apelido de outra', () => emTransacao(async (c) => {
    const t = await inst(c, `TESTE T ${M}4`)
    await apelido(c, t, `TESTE B ${M}4`)
    await imediato(c)
    await expect(inst(c, `teste b ${M}4 `)).rejects.toThrow(
      `o nome "teste b ${M}4 " já é apelido de "TESTE T ${M}4"`)
  }))

  it('recusa nome canonico editado para apelido de outra', () => emTransacao(async (c) => {
    const t = await inst(c, `TESTE T ${M}5`)
    await apelido(c, t, `TESTE B ${M}5`)
    const b = await inst(c, `Outro ${M}5`)
    await imediato(c)
    await expect(c.query('update instituicao set nome_canonico = $1 where id = $2',
      [`TESTE B ${M}5`, b])).rejects.toThrow(`o nome "TESTE B ${M}5" já é apelido de "TESTE T ${M}5"`)
  }))

  it('aceita apelido igual ao nome canonico da propria instituicao', () => emTransacao(async (c) => {
    const t = await inst(c, `TESTE T ${M}6`)
    await imediato(c)
    await apelido(c, t, ` teste t ${M.toLowerCase()}6`)
  }))

  it('recusa apelido repetido em caixa diferente em outra instituicao', () => emTransacao(async (c) => {
    const a = await inst(c, `A ${M}7`)
    const b = await inst(c, `B ${M}7`)
    await apelido(c, a, `UFJF ${M}7`)
    await imediato(c)
    await expect(apelido(c, b, `ufjf ${M}7`)).rejects.toThrow(
      `o apelido "ufjf ${M}7" já é apelido de "A ${M}7"`)
  }))

  it('recusa nome canonico repetido em caixa diferente', () => emTransacao(async (c) => {
    await inst(c, `Federal ${M}8`)
    await imediato(c)
    await expect(inst(c, `FEDERAL ${M}8`)).rejects.toThrow(
      `o nome "FEDERAL ${M}8" já é o nome de outra instituição: "Federal ${M}8"`)
  }))
})

describe('pela salvar_instituicao e pela mesclagem', () => {
  it('salvar_instituicao com apelido conflitante recusa e nada muda', () => emTransacao(async (c) => {
    await inst(c, `TESTE B ${M}9`)
    const t = await inst(c, `TESTE T ${M}9`)
    await apelido(c, t, `Antigo ${M}9`)
    await imediato(c)
    await c.query('savepoint antes')
    await expect(c.query('select public.salvar_instituicao($1::jsonb)', [JSON.stringify({
      id: t, nome_canonico: `Renomeada ${M}9`, apelidos: [`TESTE B ${M}9`],
    })])).rejects.toThrow(`o apelido "TESTE B ${M}9" já é o nome de outra instituição`)
    await c.query('rollback to savepoint antes')
    const linha = (await c.query('select nome_canonico from instituicao where id = $1', [t])).rows[0]
    expect(linha.nome_canonico).toBe(`TESTE T ${M}9`)
    const apelidos = await c.query('select apelido from instituicao_apelido where instituicao_id = $1', [t])
    expect(apelidos.rows.map((r) => r.apelido)).toEqual([`Antigo ${M}9`])
  }))

  // Sem imediato(): a checagem so dispara no COMMIT. A mensagem depende de
  // qual evento pendente dispara primeiro (o nome "TESTE B" ou o apelido
  // "TESTE B"); o que importa aqui e que o COMMIT falha e nada fica.
  it('no COMMIT de verdade, o conflito desfaz a transacao inteira', async () => {
    const c = await conectar()
    try {
      await c.query('begin')
      await inst(c, `TESTE B ${M}10`)
      await c.query('select public.salvar_instituicao($1::jsonb)', [JSON.stringify({
        nome_canonico: `TESTE T ${M}10`, apelidos: [`TESTE B ${M}10`],
      })])
      await expect(c.query('commit')).rejects.toMatchObject({ code: 'P0001' })
      const sobrou = await c.query(
        'select count(*)::int as n from instituicao where nome_canonico like $1', [`%${M}10`])
      expect(sobrou.rows[0].n).toBe(0)
    } finally {
      await c.query('rollback').catch(() => {})
      await c.query('delete from instituicao where nome_canonico like $1', [`%${M}10`])
      await c.end()
    }
  })

  // mesclar.test.js desfaz cada caso sem COMMIT, entao nunca dispara os
  // triggers deferidos; este caso commita de verdade.
  it('a mesclagem continua valendo no COMMIT (o nome da perdedora vira apelido)', async () => {
    const c = await conectar()
    try {
      await c.query('begin')
      const vencedor = await inst(c, `Vencedora ${M}11`)
      const perdedor = await inst(c, `Perdedora ${M}11`)
      await apelido(c, perdedor, `Apelido Perdedora ${M}11`)
      await c.query('select public.mesclar_instituicoes($1, $2)', [vencedor, perdedor])
      await c.query('commit')
      const apelidos = await c.query(
        'select apelido from instituicao_apelido where instituicao_id = $1 order by apelido', [vencedor])
      expect(apelidos.rows.map((r) => r.apelido)).toEqual(
        [`Apelido Perdedora ${M}11`, `Perdedora ${M}11`])
    } finally {
      await c.query('rollback').catch(() => {})
      await c.query('delete from instituicao where nome_canonico like $1', [`%${M}11`])
      await c.end()
    }
  })

  it('membro da equipe tambem e recusado, com a mensagem nova', async () => {
    await comoUsuario(MEMBRO, async (c) => {
      await c.query('select public.salvar_instituicao($1::jsonb)', [JSON.stringify({
        nome_canonico: `TESTE B ${M}12` })])
      await imediato(c)
      await expect(c.query('select public.salvar_instituicao($1::jsonb)', [JSON.stringify({
        nome_canonico: `TESTE T ${M}12`, apelidos: [`TESTE B ${M}12`] })])).rejects.toThrow(
        `o apelido "TESTE B ${M}12" já é o nome de outra instituição: "TESTE B ${M}12"`)
    })
  })
})

describe('catalogo', () => {
  it('as duas checagens sao constraint triggers deferrable initially deferred', async () => {
    const c = await conectar()
    try {
      const { rows } = await c.query(`
        select tgrelid::regclass::text as tabela, tgdeferrable, tginitdeferred
        from pg_trigger where tgname like 'ck_apelido_vs_nome%' order by 1`)
      expect(rows).toEqual([
        { tabela: 'instituicao', tgdeferrable: true, tginitdeferred: true },
        { tabela: 'instituicao_apelido', tgdeferrable: true, tginitdeferred: true },
      ])
    } finally {
      await c.end()
    }
  })
})
