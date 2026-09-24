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

  it('a varredura enxerga as tabelas conhecidas', async () => {
    const cliente = await conectar()
    const { rows } = await cliente.query(`
      select c.relname as tabela
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by 1
    `)
    await cliente.end()
    const tabelas = rows.map((r) => r.tabela)

    // Se este expect falhar, as duas assercoes acima estao passando por
    // vazio — a varredura nao esta olhando onde deveria.
    for (const esperada of ['instituicao', 'instituicao_apelido', 'prova',
                            'curso', 'materia', 'membro_equipe',
                            'aluno', 'aluno_perfil', 'depoimento',
                            'depoimento_tipo', 'depoimento_canal',
                            'participacao', 'nota', 'resultado']) {
      expect(tabelas).toContain(esperada)
    }
  })

  it('toda chamada a eh_membro_equipe() em politica esta dentro de (select ...)', async () => {
    const cliente = await conectar()
    const { rows } = await cliente.query(`
      select schemaname, tablename, policyname, qual, with_check
      from pg_policies
      where schemaname in ('public', 'storage')
      order by 1, 2, 3
    `)
    await cliente.end()

    // Forma impressa por pg_get_expr para "(select public.eh_membro_equipe())",
    // descoberta consultando pg_policies apos criar a politica de teste — nao
    // adivinhada. O nome do schema some porque "public" esta no search_path.
    const CHAMADA = 'eh_membro_equipe()'

    // Toda ocorrencia da chamada (com parenteses) tem de vir logo depois de
    // "SELECT " — a marca de que esta dentro do InitPlan. A varredura falha
    // se a lista de politicas com a chamada estiver vazia: nao pode passar
    // por engano so porque nao achou nenhuma.
    let encontrouChamada = false
    const semInitPlan = []
    for (const linha of rows) {
      for (const campo of ['qual', 'with_check']) {
        const texto = linha[campo]
        if (!texto || !texto.includes(CHAMADA)) continue
        encontrouChamada = true
        let pos = texto.indexOf(CHAMADA)
        while (pos !== -1) {
          const antes = texto.slice(0, pos)
          if (!antes.endsWith('SELECT ')) {
            semInitPlan.push(`${linha.schemaname}.${linha.tablename}.${linha.policyname} (${campo}): ${texto}`)
          }
          pos = texto.indexOf(CHAMADA, pos + CHAMADA.length)
        }
      }
    }

    expect(encontrouChamada).toBe(true)
    expect(semInitPlan).toEqual([])
  })
})
