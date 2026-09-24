import { describe, it, expect } from 'vitest'
import { conectar } from './ajuda.js'

describe('catalogo', () => {
  it('toda tabela de public tem RLS habilitada', async () => {
    const cliente = await conectar()
    try {
      const { rows } = await cliente.query(`
        select c.relname as tabela
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and not c.relrowsecurity
        order by 1
      `)
      expect(rows.map((r) => r.tabela)).toEqual([])
    } finally {
      await cliente.end()
    }
  })

  it('toda tabela de public tem ao menos uma politica', async () => {
    const cliente = await conectar()
    try {
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
      expect(rows.map((r) => r.tabela)).toEqual([])
    } finally {
      await cliente.end()
    }
  })

  it('a varredura enxerga as tabelas conhecidas', async () => {
    const cliente = await conectar()
    try {
      const { rows } = await cliente.query(`
        select c.relname as tabela
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by 1
      `)
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
    } finally {
      await cliente.end()
    }
  })

  it('toda chamada a eh_membro_equipe() em politica esta dentro de (select ...)', async () => {
    const cliente = await conectar()
    try {
      const { rows } = await cliente.query(`
        select schemaname, tablename, policyname, qual, with_check
        from pg_policies
        where schemaname in ('public', 'storage')
        order by 1, 2, 3
      `)

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
    } finally {
      await cliente.end()
    }
  })

  it('toda politica de dados em public tem a mesma forma, exceto a leitura do membro_equipe', async () => {
    const cliente = await conectar()
    try {
      const { rows } = await cliente.query(`
        select tablename, policyname, cmd, qual, with_check
        from pg_policies
        where schemaname = 'public'
        order by 1, 2
      `)

      // Texto exato que o Postgres imprime em pg_policies para
      // "(select public.eh_membro_equipe())", descoberto consultando
      // pg_policies (nao adivinhado): o schema some porque "public" esta
      // no search_path, e o Postgres nomeia a coluna do sub-select pela
      // propria funcao chamada.
      const FORMA = '( SELECT eh_membro_equipe() AS eh_membro_equipe)'

      const leitura = rows.find((r) => r.policyname === 'membro_equipe_leitura')
      expect(leitura).toMatchObject({ cmd: 'SELECT', qual: FORMA, with_check: null })

      const deDados = rows.filter((r) => r.policyname !== 'membro_equipe_leitura')

      // Nao pode passar por vazio: tem de enxergar as 13 tabelas de dados
      // (todas as tabelas canonicas exceto membro_equipe, que tem politica
      // propria de so-leitura).
      const tabelas = new Set(deDados.map((r) => r.tablename))
      expect(tabelas.size).toBe(13)

      const foraDoPadrao = deDados
        .filter((r) => r.cmd !== 'ALL' || r.qual !== FORMA || r.with_check !== FORMA)
        .map((r) => `${r.tablename}.${r.policyname}: cmd=${r.cmd} qual=${r.qual} with_check=${r.with_check}`)
      expect(foraDoPadrao).toEqual([])
    } finally {
      await cliente.end()
    }
  })

  it('toda tabela de public com coluna atualizado_em tem o trigger trg_tocar_atualizado_em', async () => {
    const cliente = await conectar()
    try {
      // Nao pode passar por vazio: se nenhuma tabela tiver a coluna, a
      // varredura abaixo nao esta olhando onde deveria (ou a coluna sumiu).
      const comColuna = await cliente.query(`
        select table_name as tabela
        from information_schema.columns
        where table_schema = 'public' and column_name = 'atualizado_em'
        order by 1
      `)
      expect(comColuna.rows.length).toBeGreaterThan(0)

      const { rows } = await cliente.query(`
        select c.relname as tabela
        from information_schema.columns col
        join pg_class c on c.relname = col.table_name
        join pg_namespace n on n.oid = c.relnamespace and n.nspname = col.table_schema
        where col.table_schema = 'public'
          and col.column_name = 'atualizado_em'
          and not exists (
            select 1 from pg_trigger t
            where t.tgrelid = c.oid and t.tgname = 'trg_tocar_atualizado_em'
          )
        order by 1
      `)
      expect(rows.map((r) => r.tabela)).toEqual([])
    } finally {
      await cliente.end()
    }
  })
})
