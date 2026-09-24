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
        .rejects.toThrow('nao da para mesclar uma instituicao com ela mesma')
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
})
