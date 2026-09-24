import { describe, it, expect } from 'vitest'
import { conectar, comoUsuario } from './ajuda.js'

// Arquivo separado de catalogo.test.js: la mora a RLS (quais linhas cada um
// ve); aqui mora o privilegio (se o papel pode sequer tocar o objeto), que
// o Postgres checa antes da RLS. Juntar os dois passaria das ~200 linhas.
//
// O projeto hospedado nao expoe tabelas novas automaticamente; a 0011
// igualou o local a ele. Toda varredura le a ACL efetiva: coalesce com
// acldefault(), porque ACL nula NAO significa "sem privilegio" — em funcao,
// nula significa EXECUTE para PUBLIC.

const TABELAS = ['aluno', 'aluno_perfil', 'curso', 'depoimento',
  'depoimento_canal', 'depoimento_tipo', 'instituicao', 'instituicao_apelido',
  'materia', 'membro_equipe', 'nota', 'participacao', 'prova', 'resultado']

const FUNCOES_DO_APP = ['buscar_depoimentos(p_filtros jsonb)', 'eh_membro_equipe()']

const MEMBRO = 'membro@exemplo.test'

async function consultar(sql, params) {
  const c = await conectar()
  try {
    return (await c.query(sql, params)).rows
  } finally {
    await c.end()
  }
}

// Privilegios explicitos de um papel ('0' = PUBLIC) em toda relacao e funcao
// de public, uma linha por (objeto, privilegio).
const ACL_DE_PUBLIC = `
  select c.relname as objeto, c.relkind::text as tipo, a.privilege_type as privilegio,
         a.grantee
  from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault(
    case when c.relkind = 'S' then 's' else 'r' end::"char", c.relowner))) a
  where c.relnamespace = 'public'::regnamespace
    and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
  union all
  select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'funcao', a.privilege_type, a.grantee
  from pg_proc p
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where p.pronamespace = 'public'::regnamespace
`

describe('privilegios de authenticated nas tabelas', () => {
  it('toda tabela de public concede a authenticated exatamente o esperado', async () => {
    const rows = await consultar(`
      select c.relname as tabela,
             coalesce(array_agg(a.privilege_type order by a.privilege_type)
               filter (where a.grantee = 'authenticated'::regrole), '{}') as privilegios
      from pg_class c
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
      group by 1
      order by 1
    `)

    // Nao pode passar por vazio: tem de enxergar as 14 tabelas canonicas.
    expect(rows.map((r) => r.tabela).sort()).toEqual(TABELAS)

    // membro_equipe: so leitura (ninguem escreve pela API). As demais: CRUD,
    // sem truncate/references/trigger. Tabela nova sem GRANT nasce reprovada.
    const erradas = rows
      .filter((r) => {
        const esperado = r.tabela === 'membro_equipe'
          ? ['SELECT']
          : ['DELETE', 'INSERT', 'SELECT', 'UPDATE']
        return JSON.stringify(r.privilegios) !== JSON.stringify(esperado)
      })
      .map((r) => `${r.tabela}: ${r.privilegios.join(',') || '(nada)'}`)
    expect(erradas).toEqual([])
  })
})

describe('papeis sem privilegio em public', () => {
  it('a varredura enxerga tabelas, sequencias e funcoes', async () => {
    const rows = await consultar(`select distinct tipo from (${ACL_DE_PUBLIC}) x`)
    expect(rows.map((r) => r.tipo).sort()).toEqual(['S', 'funcao', 'r'])
  })

  it.each(['anon', 'service_role'])('%s nao tem privilegio em tabela, sequencia ou funcao', async (papel) => {
    const rows = await consultar(`
      select objeto, privilegio from (${ACL_DE_PUBLIC}) x
      where grantee = $1::regrole
      order by 1, 2
    `, [papel])
    expect(rows.map((r) => `${r.objeto}: ${r.privilegio}`)).toEqual([])
  })

  it('authenticated nao tem privilegio em sequencia (identidade dispensa)', async () => {
    const rows = await consultar(`
      select objeto, privilegio from (${ACL_DE_PUBLIC}) x
      where tipo = 'S' and grantee = 'authenticated'::regrole
    `)
    expect(rows).toEqual([])
  })
})

describe('EXECUTE em funcoes de public', () => {
  it('nenhuma funcao de public tem EXECUTE para PUBLIC', async () => {
    const rows = await consultar(`
      select objeto from (${ACL_DE_PUBLIC}) x
      where tipo = 'funcao' and grantee = 0
      order by 1
    `)
    expect(rows.map((r) => r.objeto)).toEqual([])
  })

  it('so as funcoes do app tem EXECUTE para authenticated', async () => {
    const todas = await consultar(`select distinct objeto from (${ACL_DE_PUBLIC}) x where tipo = 'funcao'`)
    // Nao pode passar por vazio: as de trigger tem de estar na varredura.
    expect(todas.map((r) => r.objeto)).toEqual(
      expect.arrayContaining(['tocar_atualizado_em()', 'valida_transicao_status()', ...FUNCOES_DO_APP]))

    const rows = await consultar(`
      select objeto from (${ACL_DE_PUBLIC}) x
      where tipo = 'funcao' and grantee = 'authenticated'::regrole
      order by 1
    `)
    expect(rows.map((r) => r.objeto).sort()).toEqual(FUNCOES_DO_APP)
  })
})

describe('privilegios padrao para objetos futuros', () => {
  // O papel das migracoes e o dono das tabelas de public (descoberto, nao
  // suposto): e o default ACL DELE que vale para a proxima migracao.
  async function papelDasMigracoes(c) {
    const { rows } = await c.query(`
      select distinct c.relowner::regrole::text as dono
      from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    `)
    expect(rows.length).toBe(1)
    return rows[0].dono
  }

  it('pg_default_acl do papel das migracoes nao concede nada aos papeis da API', async () => {
    const c = await conectar()
    try {
      const dono = await papelDasMigracoes(c)
      const { rows } = await c.query(`
        select coalesce(d.defaclnamespace::regnamespace::text, '(global)') as schema,
               d.defaclobjtype::text as tipo,
               case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as papel
        from pg_default_acl d
        cross join lateral aclexplode(d.defaclacl) a
        where d.defaclrole = $1::regrole
          and d.defaclnamespace in (0, 'public'::regnamespace)
          and (a.grantee = 0 or a.grantee in (
            'anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole))
        order by 1, 2, 3
      `, [dono])
      expect(rows.map((r) => `${r.schema}/${r.tipo}: ${r.papel}`)).toEqual([])
    } finally {
      await c.end()
    }
  })

  it('tabela, sequencia e funcao criadas agora nascem so com o dono', async () => {
    // Prova de comportamento, alem do catalogo: um revoke por schema de
    // EXECUTE para PUBLIC nao remove o padrao embutido do Postgres (padroes
    // por schema so somam aos globais). So criando o objeto se ve o efeito.
    const c = await conectar()
    try {
      await c.query('begin')
      const dono = await papelDasMigracoes(c)
      await c.query(`set local role ${dono}`)
      await c.query('create table public.zz_sonda (id bigint generated always as identity)')
      await c.query(`create function public.zz_sonda_fn() returns int language sql as 'select 1'`)
      const { rows } = await c.query(`
        select objeto, privilegio, case when grantee = 0 then 'PUBLIC' else grantee::regrole::text end as papel
        from (${ACL_DE_PUBLIC}) x
        where objeto like 'zz_sonda%' and grantee <> $1::regrole
        order by 1, 2, 3
      `, [dono])
      const objetos = await c.query(
        `select count(*)::int as n from (${ACL_DE_PUBLIC}) x where objeto like 'zz_sonda%'`)
      // Nao pode passar por vazio: os tres objetos-sonda tem de aparecer.
      expect(objetos.rows[0].n).toBeGreaterThanOrEqual(3)
      expect(rows.map((r) => `${r.objeto}: ${r.privilegio} -> ${r.papel}`)).toEqual([])
    } finally {
      await c.query('rollback').catch(() => {})
      await c.end()
    }
  })
})

describe('o app continua funcionando sob os privilegios minimos', () => {
  const garantirMembro = () => consultar(
    `insert into membro_equipe (email, nome, ativo) values ($1, 'Membro Ativo', true)
     on conflict (email) do nothing`, [MEMBRO])

  it('membro insere em tabela com identidade sem privilegio na sequencia', async () => {
    await garantirMembro()
    const linhas = await comoUsuario(MEMBRO, (c) => c.query(
      `insert into instituicao (nome_canonico) values ('SONDA PRIVILEGIO') returning id`)
      .then((r) => r.rows))
    expect(linhas.length).toBe(1)
  })

  it('trigger de atualizado_em dispara para authenticated', async () => {
    const [inserido] = await consultar(
      `insert into depoimento (texto_completo, fonte) values ('Sonda privilegio', 'MANUAL')
       returning id, atualizado_em::text as atualizado_em`)
    await garantirMembro()
    const [linha] = await comoUsuario(MEMBRO, (c) => c.query(
      `update depoimento set texto_completo = 'Sonda privilegio 2' where id = $1
       returning atualizado_em > $2::timestamptz as avancou`,
      [inserido.id, inserido.atualizado_em]).then((r) => r.rows))
    expect(linha).toEqual({ avancou: true })
  })

  it('trigger de transicao dispara para authenticated', async () => {
    const [inserido] = await consultar(
      `insert into depoimento (texto_completo, fonte) values ('Sonda transicao', 'MANUAL')
       returning id`)
    await garantirMembro()
    await expect(comoUsuario(MEMBRO, (c) => c.query(
      `update depoimento set status_uso = 'FEITO' where id = $1`, [inserido.id])))
      .rejects.toThrow(/transicao de status invalida: DISPONIVEL -> FEITO/)
  })
})
