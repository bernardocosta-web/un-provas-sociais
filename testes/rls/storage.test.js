import { describe, it, expect, beforeAll } from 'vitest'
import { conectar, comoAnonimo, comoUsuario } from './ajuda.js'

const MEMBRO = 'membro@exemplo.test'
const ESTRANHO = 'estranho@exemplo.test'

// Erro real do RLS, nao qualquer erro (typo de coluna, violacao de constraint etc).
const ERRO_RLS = /row-level security|permission denied/

beforeAll(async () => {
  const cliente = await conectar()
  await cliente.query(`
    insert into membro_equipe (email, nome, ativo) values
      ($1, 'Membro Ativo', true)
    on conflict (email) do nothing
  `, [MEMBRO])
  await cliente.query(`
    insert into storage.objects (bucket_id, name) values ('prints', 'seed-leitura.png')
    on conflict (bucket_id, name) do nothing
  `)
  await cliente.query(`
    insert into storage.objects (bucket_id, name) values ('logos', 'seed-logos.png')
    on conflict (bucket_id, name) do nothing
  `)
  await cliente.end()
})

describe('buckets', () => {
  it('prints e privado e logos e publico', async () => {
    const c = await conectar()
    const { rows } = await c.query(
      `select id, public from storage.buckets where id in ('prints','logos') order by id`)
    await c.end()
    expect(rows).toEqual([
      { id: 'logos', public: true },
      { id: 'prints', public: false },
    ])
  })

  it('cada bucket tem politica de escrita restrita a equipe', async () => {
    const c = await conectar()
    const { rows } = await c.query(`
      select polname from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'storage' and c.relname = 'objects'
        and polname like '%escrita%'
    `)
    await c.end()
    expect(rows.length).toBeGreaterThanOrEqual(2)
  })
})

describe('escrita restrita a equipe', () => {
  it.each(['prints', 'logos'])('anonimo nao insere em %s', async (bucket) => {
    await expect(
      comoAnonimo((c) =>
        c.query(`insert into storage.objects (bucket_id, name) values ($1, 'invasor.png')`, [bucket]))
    ).rejects.toThrow(ERRO_RLS)
  })

  it.each(['prints', 'logos'])('estranho nao insere em %s', async (bucket) => {
    await expect(
      comoUsuario(ESTRANHO, (c) =>
        c.query(`insert into storage.objects (bucket_id, name) values ($1, 'invasor.png')`, [bucket]))
    ).rejects.toThrow(ERRO_RLS)
  })

  it.each(['prints', 'logos'])('membro insere em %s', async (bucket) => {
    await comoUsuario(MEMBRO, (c) =>
      c.query(`insert into storage.objects (bucket_id, name) values ($1, 'membro-teste.png')`, [bucket]))
  })
})

describe('insert com returning', () => {
  it.each(['prints', 'logos'])('membro insere com returning em %s', async (bucket) => {
    const linhas = await comoUsuario(MEMBRO, (c) =>
      c.query(
        `insert into storage.objects (bucket_id, name) values ($1, 'retorno-teste.png') returning id`,
        [bucket]
      ).then((r) => r.rows))
    expect(linhas.length).toBe(1)
  })
})

describe('remocao pela equipe', () => {
  it.each(['prints', 'logos'])('membro remove o que acabou de inserir em %s', async (bucket) => {
    await comoUsuario(MEMBRO, async (c) => {
      await c.query(`select set_config('storage.allow_delete_query', 'true', true)`)
      await c.query(
        `insert into storage.objects (bucket_id, name) values ($1, 'remocao-membro.png')`, [bucket])
      const resultado = await c.query(
        `delete from storage.objects where bucket_id = $1 and name = 'remocao-membro.png'`, [bucket])
      expect(resultado.rowCount).toBe(1)
    })
  })

  it.each(['prints', 'logos'])('estranho nao remove em %s', async (bucket) => {
    const nomeSemente = bucket === 'prints' ? 'seed-leitura.png' : 'seed-logos.png'
    await comoUsuario(ESTRANHO, async (c) => {
      await c.query(`select set_config('storage.allow_delete_query', 'true', true)`)
      const resultado = await c.query(
        `delete from storage.objects where bucket_id = $1 and name = $2`, [bucket, nomeSemente])
      expect(resultado.rowCount).toBe(0)

      await c.query('reset role')
      const { rows } = await c.query(
        `select 1 from storage.objects where bucket_id = $1 and name = $2`, [bucket, nomeSemente])
      expect(rows.length).toBe(1)
    })
  })
})

describe('isolamento de leitura de prints', () => {
  it('estranho nao le objetos de prints', async () => {
    const linhas = await comoUsuario(ESTRANHO, (c) =>
      c.query(`select * from storage.objects where bucket_id = 'prints'`).then((r) => r.rows))
    expect(linhas).toEqual([])
  })

  it('anonimo nao le objetos de prints', async () => {
    const linhas = await comoAnonimo((c) =>
      c.query(`select * from storage.objects where bucket_id = 'prints'`).then((r) => r.rows))
    expect(linhas).toEqual([])
  })

  it('membro le objetos de prints', async () => {
    const linhas = await comoUsuario(MEMBRO, (c) =>
      c.query(`select * from storage.objects where bucket_id = 'prints'`).then((r) => r.rows))
    expect(linhas.length).toBeGreaterThan(0)
  })
})
