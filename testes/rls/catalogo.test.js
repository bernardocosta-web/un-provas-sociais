import { describe, it, expect } from 'vitest'
import { conectar } from './ajuda.js'

describe('catalogo', () => {
  it('toda tabela de public tem RLS habilitada', async () => {
    const cliente = await conectar()
    const { rows } = await cliente.query(`
      select c.relname as tabela
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and not c.relrowsecurity
      order by 1
    `)
    await cliente.end()
    expect(rows.map((r) => r.tabela)).toEqual([])
  })

  it('toda tabela de public tem ao menos uma politica', async () => {
    const cliente = await conectar()
    const { rows } = await cliente.query(`
      select c.relname as tabela
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and not exists (
          select 1 from pg_policy p where p.polrelid = c.oid
        )
      order by 1
    `)
    await cliente.end()
    expect(rows.map((r) => r.tabela)).toEqual([])
  })
})
