import { describe, it, expect, beforeAll } from 'vitest'
import { conectar, comoUsuario } from './ajuda.js'

const MEMBRO = 'membro@exemplo.test'

// Monta vencedora, perdedora (com logo) e um resultado apontando para a
// perdedora. Nomes com marcador: cada teste roda numa transacao desfeita no
// fim, entao nada fica para tras e nao ha disputa com outros arquivos.
async function cenario(c, sufixo) {
  const vencedor = (await c.query(
    `insert into instituicao (nome_canonico) values ($1) returning id`,
    [`Universidade Federal de Juiz de Fora ${sufixo}`])).rows[0].id
  const perdedor = (await c.query(
    `insert into instituicao (nome_canonico, logo_path) values ($1, $2) returning id`,
    [`UFJF ${sufixo}`, `logo-perdedora-${sufixo}.webp`])).rows[0].id
  const dep = (await c.query(
    `insert into depoimento (texto_completo, fonte)
     values ($1, 'MANUAL') returning id`, [`Mesclagem ${sufixo}`])).rows[0].id
  const prova = (await c.query(
    `insert into prova (nome) values ('ENEM')
     on conflict (nome) do update set nome = excluded.nome
     returning id`)).rows[0].id
  const part = (await c.query(
    `insert into participacao (depoimento_id, prova_id, ano)
     values ($1, $2, 2025) returning id`, [dep, prova])).rows[0].id
  await c.query(
    `insert into resultado (participacao_id, instituicao_id, situacao)
     values ($1, $2, 'APROVADO')`, [part, perdedor])
  return { vencedor, perdedor, part }
}

async function conferir(c, { vencedor, perdedor, part }, sufixo) {
  const restou = await c.query(
    'select count(*)::int as n from instituicao where id = $1', [perdedor])
  expect(restou.rows[0].n).toBe(0)

  const apelido = await c.query(
    'select apelido from instituicao_apelido where instituicao_id = $1', [vencedor])
  expect(apelido.rows.map((r) => r.apelido)).toContain(`UFJF ${sufixo}`)

  const migrado = await c.query(
    'select instituicao_id from resultado where participacao_id = $1', [part])
  expect(Number(migrado.rows[0].instituicao_id)).toBe(Number(vencedor))
}

beforeAll(async () => {
  const c = await conectar()
  await c.query(
    `insert into membro_equipe (email, nome, ativo) values ($1, 'Membro Ativo', true)
     on conflict (email) do nothing`, [MEMBRO])
  await c.end()
})

describe('mesclar_instituicoes', () => {
  it('transforma a perdedora em apelido da vencedora e migra os resultados', async () => {
    const c = await conectar()
    try {
      await c.query('begin')
      const ids = await cenario(c, 'MARCADORMESCLAR1')
      const logo = (await c.query(
        'select public.mesclar_instituicoes($1, $2) as logo',
        [ids.vencedor, ids.perdedor])).rows[0].logo
      // O logo da perdedora volta para quem chama remover do bucket.
      expect(logo).toBe('logo-perdedora-MARCADORMESCLAR1.webp')
      await conferir(c, ids, 'MARCADORMESCLAR1')
    } finally {
      await c.query('rollback').catch(() => {})
      await c.end()
    }
  })

  it('recusa mesclar uma instituicao com ela mesma', async () => {
    const c = await conectar()
    try {
      await c.query('begin')
      const { vencedor } = await cenario(c, 'MARCADORMESCLAR2')
      await expect(c.query('select public.mesclar_instituicoes($1, $1)', [vencedor]))
        .rejects.toThrow('não dá para mesclar uma instituição com ela mesma')
    } finally {
      await c.query('rollback').catch(() => {})
      await c.end()
    }
  })

  // Pelo caminho do app: authenticated precisa de EXECUTE (0012) e de
  // privilegio nas tabelas (0011); a RLS decide as linhas.
  it('membro ativo da equipe mescla pela API', async () => {
    await comoUsuario(MEMBRO, async (c) => {
      const ids = await cenario(c, 'MARCADORMESCLAR3')
      await c.query('select public.mesclar_instituicoes($1, $2)', [ids.vencedor, ids.perdedor])
      await conferir(c, ids, 'MARCADORMESCLAR3')
    })
  })

  // Revisao do Marco 3, cenario A/B/T: o nome (ou apelido) da perdedora que
  // vira apelido da vencedora nao pode ser descartado em silencio pelo
  // "on conflict do nothing" quando ja pertence a uma TERCEIRA instituicao —
  // as buscas por esse nome cairiam na dona errada. A funcao deve recusar
  // antes de mover qualquer coisa.
  it('recusa mesclar quando o nome da perdedora ja e apelido de uma terceira instituicao, e nao muda nada', async () => {
    const c = await conectar()
    try {
      await c.query('begin')
      const sufixo = 'MARCADORMESCLAR4'
      const ids = await cenario(c, sufixo)
      const terceira = (await c.query(
        `insert into instituicao (nome_canonico) values ($1) returning id`,
        [`Terceira ${sufixo}`])).rows[0].id
      await c.query(
        `insert into instituicao_apelido (instituicao_id, apelido) values ($1, $2)`,
        [terceira, `UFJF ${sufixo}`])

      // savepoint: apos o erro esperado, a transacao fica abortada ate um
      // rollback — permite continuar conferindo o estado na mesma transacao
      // (desfeita inteira pelo rollback do finally).
      await c.query('savepoint antes_da_tentativa')
      await expect(c.query('select public.mesclar_instituicoes($1, $2)', [ids.vencedor, ids.perdedor]))
        .rejects.toThrow(new RegExp(`UFJF ${sufixo}.*Terceira ${sufixo}`))
      await c.query('rollback to savepoint antes_da_tentativa')

      const perdedoraAinda = await c.query(
        'select count(*)::int as n from instituicao where id = $1', [ids.perdedor])
      expect(perdedoraAinda.rows[0].n).toBe(1)

      const donaDoApelido = await c.query(
        'select instituicao_id from instituicao_apelido where apelido = $1', [`UFJF ${sufixo}`])
      expect(Number(donaDoApelido.rows[0].instituicao_id)).toBe(Number(terceira))

      const resultadoAinda = await c.query(
        'select instituicao_id from resultado where participacao_id = $1', [ids.part])
      expect(Number(resultadoAinda.rows[0].instituicao_id)).toBe(Number(ids.perdedor))
    } finally {
      await c.query('rollback').catch(() => {})
      await c.end()
    }
  })

  // O "do nothing" so pode valer quando quem ja tem o apelido e a propria
  // vencedora (caso idempotente); nao pode ser confundido com o caso acima.
  it('aceita mesclar quando a vencedora ja tem o nome da perdedora como apelido', async () => {
    const c = await conectar()
    try {
      await c.query('begin')
      const sufixo = 'MARCADORMESCLAR5'
      const ids = await cenario(c, sufixo)
      await c.query(
        `insert into instituicao_apelido (instituicao_id, apelido) values ($1, $2)`,
        [ids.vencedor, `UFJF ${sufixo}`])

      const logo = (await c.query(
        'select public.mesclar_instituicoes($1, $2) as logo',
        [ids.vencedor, ids.perdedor])).rows[0].logo
      expect(logo).toBe(`logo-perdedora-${sufixo}.webp`)
      await conferir(c, ids, sufixo)
    } finally {
      await c.query('rollback').catch(() => {})
      await c.end()
    }
  })

  // Revisao do Marco 3, item 5: quem nao esta em membro_equipe nao pode
  // mesclar. Causa real observada (probe manual contra o banco local): a RLS
  // de SELECT esconde a instituicao vencedora de quem chama, entao a funcao
  // levanta a mesma excecao de "nao existe" que usaria para um id invalido —
  // nao um "permission denied" separado (essa so aparece em INSERT/UPDATE
  // direto, ver o teste equivalente em salvar_instituicao.test.js).
  it('estranho (fora da equipe) nao mescla, e nao muda nada', async () => {
    const c = await conectar()
    try {
      await c.query('begin')
      const ids = await cenario(c, 'MARCADORMESCLAR6')

      await c.query('savepoint antes_do_estranho')
      await c.query('set local role authenticated')
      await c.query('select set_config($1, $2, true)', [
        'request.jwt.claims',
        JSON.stringify({ role: 'authenticated', email: 'estranho@exemplo.test' }),
      ])
      await expect(c.query('select public.mesclar_instituicoes($1, $2)', [ids.vencedor, ids.perdedor]))
        .rejects.toMatchObject({ message: expect.stringContaining('não existe') })
      // rollback to savepoint desfaz o SET LOCAL tambem: volta ao papel de
      // conectar() (sem RLS), o que permite conferir o estado abaixo.
      await c.query('rollback to savepoint antes_do_estranho')

      const perdedoraAinda = await c.query(
        'select count(*)::int as n from instituicao where id = $1', [ids.perdedor])
      expect(perdedoraAinda.rows[0].n).toBe(1)
    } finally {
      await c.query('rollback').catch(() => {})
      await c.end()
    }
  })
})
