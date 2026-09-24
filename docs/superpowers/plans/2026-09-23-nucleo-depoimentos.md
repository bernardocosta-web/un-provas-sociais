# Núcleo de Depoimentos — Plano de Implementação

> **Para trabalhadores agênticos:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Construir o núcleo do UN Provas Sociais — banco, login, cadastro manual de depoimentos e busca com filtros — como site estático no GitHub Pages sobre Supabase.

**Architecture:** O navegador fala direto com o Supabase; não há back-end próprio. Toda regra de integridade vive no Postgres (constraints, coluna gerada, trigger) e todo controle de acesso vive em políticas de RLS, ambos versionados como migrações SQL e cobertos por testes. A lógica pura fica em `src/lib/`, sem Vue e sem Supabase, testada em Node. A busca com semântica de depoimento roda numa função SQL, porque PostgREST não expressa `EXISTS` independentes.

**Tech Stack:** Node 22+, Vite 6, Vue 3.5, Vitest 3, `@supabase/supabase-js` 2, `pg` (testes de RLS), Supabase CLI, Docker Desktop, GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-23-nucleo-depoimentos-design.md`

## Global Constraints

Estas restrições valem para **todas** as tarefas. Não repetir em cada uma; violá-las reprova a tarefa.

- **Nenhum dado real de aluno ou da equipe no repositório.** Nem em migração, nem em fixture, nem em seed. E-mails de teste usam `@exemplo.test`.
- **Nenhum segredo no repositório.** A `anon key` é publicável e entra pelo build via Secrets; a `service_role key`, o client secret do Google e a URL do Healthchecks nunca aparecem no código.
- **Toda tabela em `public` tem RLS habilitada.** Tabela nova sem RLS reprova a suíte.
- **Lógica pura em `src/lib/`**, sem importar Vue nem `supabase-js`. Componente não decide.
- **Arquivo acima de ~200 linhas ou com mais de uma responsabilidade deve ser dividido.**
- **Idioma:** código e identificadores em português, como o schema. Interface e documentação em pt-BR.
- **TDD sem exceção:** teste falhando antes da implementação, sempre.
- **Commits pequenos**, um por tarefa no mínimo.
- **Nomes canônicos do schema** (usados por todas as tarefas): `instituicao`, `instituicao_apelido`, `prova`, `curso`, `materia`, `aluno`, `aluno_perfil`, `depoimento`, `depoimento_tipo`, `depoimento_canal`, `participacao`, `nota`, `resultado`, `membro_equipe`.
- **Banco local de teste:** `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (padrão do `supabase start`).

---

# Marco 1 — Fundação, schema e RLS

**Entrega ao fim do marco:** banco completo rodando localmente, com todas as regras de integridade e todas as políticas de acesso, provadas por uma suíte de testes que roda em um comando. Nenhuma interface ainda — e mesmo assim é a metade do sistema que mais importa.

---

### Task 1: Fundação do repositório

**Files:**
- Create: `.gitignore`, `.gitattributes`, `CLAUDE.md`, `package.json`, `vite.config.js`, `index.html`, `src/main.js`, `src/App.vue`

**Interfaces:**
- Consumes: nada
- Produces: projeto Node instalável com `npm install`, `npm test` e `npm run dev` funcionando

- [ ] **Step 1: Criar `.gitignore`**

```gitignore
node_modules/
dist/
coverage/
.env
.env.*
!.env.example
supabase/.temp/
supabase/.branches/
backups/
*.log
.DS_Store
Thumbs.db

# Mídia local de trabalho — prints e logos nunca entram no repo
prints/
logos/
*.png
*.jpg
*.jpeg
*.webp
```

- [ ] **Step 2: Criar `.gitattributes`**

Silencia o aviso de CRLF do Git no Windows e garante que SQL e YAML não quebrem no Linux do CI.

```gitattributes
* text=auto eol=lf
*.sql text eol=lf
*.yml text eol=lf
*.sh text eol=lf
*.png binary
*.jpg binary
*.webp binary
```

- [ ] **Step 3: Criar `package.json`**

```json
{
  "name": "un-provas-sociais",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Dashboard de depoimentos e provas sociais do Universo Narrado",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:rls": "vitest run testes/rls",
    "db:start": "supabase start",
    "db:reset": "supabase db reset"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "vue": "^3.5.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.1.0",
    "pg": "^8.13.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 4: Criar `vite.config.js`**

O `base` é obrigatório: o GitHub Pages serve em subpasta, e errar isso quebra todos os caminhos no ar funcionando perfeitamente na máquina local.

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/un-provas-sociais/',
  plugins: [vue()],
  test: {
    environment: 'node',
    include: ['testes/**/*.test.js'],
  },
})
```

- [ ] **Step 5: Criar o shell mínimo**

`index.html`:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>UN Provas Sociais</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

`src/main.js`:

```js
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
```

`src/App.vue`:

```vue
<template>
  <main>
    <h1>UN Provas Sociais</h1>
  </main>
</template>
```

- [ ] **Step 6: Criar `CLAUDE.md`**

```markdown
# CLAUDE.md — UN Provas Sociais

Constituição do projeto. Leia por inteiro antes de qualquer ação.

## 1. O que é

Dashboard para centralizar, classificar e filtrar depoimentos de alunos do
Universo Narrado, preparando posts de prova social no Instagram. Subprojeto #1
de quatro — ver `docs/superpowers/specs/`.

## 2. Stack

Site estático no GitHub Pages sobre Supabase (Postgres, Auth, Storage). Sem
back-end próprio. Vite + Vue 3. Vitest. Interface e documentação em pt-BR.

## 3. Invariantes — o que NUNCA quebrar

- **RLS em toda tabela de `public`.** Tabela nova sem RLS reprova a suíte. RLS
  desligada entrega o dado para a internet inteira, e nada no código denuncia.
- **`nota.percentual` é coluna gerada.** Nenhum código a escreve. Não
  transformar em coluna comum "para simplificar".
- **Nenhum dado real no repositório** — nem de aluno, nem de e-mail da equipe.
  Fixtures são inventadas, com domínio `@exemplo.test`.
- **`anon key` é publicável; `service_role key` nunca sai dos Secrets.**
- **Filtros valem no nível do depoimento**, satisfeitos por qualquer
  participação. Não "consertar" para `JOIN` na mesma participação — existe um
  teste nomeado que reprova essa mudança, e ele está certo.
- **Lógica pura em `src/lib/`**, sem Vue e sem Supabase.

## 4. Como trabalhar aqui

Brainstorm → plano → TDD → commit pequeno. Decisões de arquitetura viram ADR em
`docs/decisions/`. Instruções diretas do Bernardo têm precedência sobre skills.
```

- [ ] **Step 7: Instalar e verificar**

Run: `npm install && npm run build`
Expected: build conclui e gera `dist/`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: fundacao do projeto (vite, vue, vitest, gitignore, CLAUDE.md)"
```

---

### Task 2 — MANUAL (Bernardo): criar o repositório público no GitHub

**Files:** nenhum. Ação no navegador e no terminal.

**Interfaces:**
- Produces: `origin` apontando para o repositório remoto; base para os workflows das tarefas seguintes

- [ ] **Step 1: Criar o repositório**

1. Abrir <https://github.com/new>
2. **Repository name:** `un-provas-sociais`
3. **Visibility: Public.** O nome precisa ser exatamente esse, porque o `base` do Vite (`/un-provas-sociais/`) depende dele.
4. **Não** marcar "Add a README", "Add .gitignore" nem "Choose a license" — o repositório local já tem conteúdo e commits.
5. Clicar em **Create repository**

- [ ] **Step 2: Conectar o repositório local**

```bash
git remote add origin https://github.com/<sua-conta>/un-provas-sociais.git
git branch -M main
git push -u origin main
```

- [ ] **Step 3: Confirmar**

Abrir o repositório no navegador e verificar que `docs/superpowers/specs/` e `CLAUDE.md` aparecem. Confirmar que **nenhum** arquivo `.env` subiu.

---

### Task 3 — MANUAL (Bernardo): Docker e Supabase CLI

**Files:** nenhum.

**Interfaces:**
- Produces: `supabase start` funcionando na máquina local

- [ ] **Step 1: Instalar o Docker Desktop**

1. Baixar em <https://www.docker.com/products/docker-desktop/>
2. Instalar e reiniciar se pedido
3. Abrir o Docker Desktop e esperar aparecer "Engine running"

O licenciamento gratuito foi confirmado em 2026-09-23: a UN tem menos de 250 funcionários e faturamento abaixo de US$ 10 milhões.

- [ ] **Step 2: Instalar a Supabase CLI**

```bash
npm install -D supabase
npx supabase --version
```

- [ ] **Step 3: Verificar se a UN já tem projetos Supabase**

Entrar em <https://supabase.com/dashboard> e contar os projetos ativos. **O plano gratuito permite 2.** Se já houver dois, não dá para criar o do dashboard sem pausar ou apagar um — resolver antes de seguir.

Registre aqui o que encontrou: ____________________

---

### Task 4: Supabase local e a suíte de RLS que falha primeiro

**Files:**
- Create: `supabase/config.toml` (gerado pelo `supabase init`), `testes/rls/ajuda.js`, `testes/rls/catalogo.test.js`

> **Emenda pós-aprovação (2026-09-23).** A versão aprovada listava aqui um `supabase/migrations/0001_extensoes.sql` que **nenhum passo criava** — e que não é necessário: o `supabase init` já gera o que a CLI precisa, e o projeto não usa extensão fora do padrão. Não crie esse arquivo. As migrações começam em `0002_enums.sql`, na Task 5.

**Interfaces:**
- Consumes: Supabase CLI da Task 3
- Produces: `conectar()`, `comoAnonimo(sql)`, `comoUsuario(email, sql)`, `comoServico(sql)` em `testes/rls/ajuda.js` — usados por todas as tarefas de RLS seguintes

- [ ] **Step 1: Inicializar e subir o Supabase local**

```bash
npx supabase init
npx supabase start
```

Guardar a saída: ela imprime a `anon key`, a `service_role key` e a URL da API locais. São de desenvolvimento, iguais em toda máquina, e **não** são segredo.

- [ ] **Step 2: Escrever o auxiliar dos testes de RLS**

`testes/rls/ajuda.js` — conecta direto no Postgres local e troca de papel por comando. É o que dá fidelidade da pilha Supabase com velocidade de Postgres puro.

```js
import pg from 'pg'

const URL_BANCO = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

export async function conectar() {
  const cliente = new pg.Client({ connectionString: URL_BANCO })
  await cliente.connect()
  return cliente
}

async function comPapel(papel, claims, executar) {
  const cliente = await conectar()
  try {
    await cliente.query('begin')
    await cliente.query(`set local role ${papel}`)
    if (claims) {
      await cliente.query('select set_config($1, $2, true)', [
        'request.jwt.claims',
        JSON.stringify(claims),
      ])
    }
    return await executar(cliente)
  } finally {
    await cliente.query('rollback').catch(() => {})
    await cliente.end()
  }
}

export const comoAnonimo = (executar) => comPapel('anon', { role: 'anon' }, executar)

export const comoUsuario = (email, executar) =>
  comPapel('authenticated', { role: 'authenticated', email }, executar)

export const comoServico = (executar) => comPapel('service_role', null, executar)
```

- [ ] **Step 3: Escrever o teste de catálogo — o mais importante da suíte**

`testes/rls/catalogo.test.js`:

```js
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
```

Este teste varre o catálogo em vez de listar tabelas conhecidas. É a diferença que importa: **tabela criada numa migração futura nasce reprovada até ser protegida.** Uma lista fixa esqueceria a tabela nova exatamente como o programador esqueceu.

- [ ] **Step 4: Rodar e ver passar de forma vazia**

Run: `npx vitest run testes/rls/catalogo.test.js`
Expected: PASS — ainda não há tabela nenhuma em `public`. O teste só ganha força na Task 5, e é por isso que ele vem antes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: suite de RLS com varredura de catalogo"
```

---

### Task 5: Enums e tabelas de referência

> **Emenda pós-aprovação (2026-09-23).** As Tasks 5 e 6 são executadas como **uma unidade, com um único commit ao final**, feito só com a suíte verde. O passo que mostra o teste de catálogo reprovando continua obrigatório — é o que prova que a varredura funciona — mas a reprovação aparece no relatório, não no histórico do Git. Commit vermelho deixaria um ponto quebrado para o `git bisect` encontrar depois.

**Files:**
- Create: `supabase/migrations/0002_enums.sql`, `supabase/migrations/0003_referencia.sql`
- Test: `testes/rls/catalogo.test.js` (já existe, passa a ter o que reprovar)

**Interfaces:**
- Produces: enums `tipo_depoimento`, `canal_un`, `fonte_depoimento`, `escala_nota`, `situacao_resultado`, `plataforma_perfil`, `autorizacao_publicacao`, `status_uso`, `motivo_descarte`; tabelas `instituicao`, `instituicao_apelido`, `prova`, `curso`, `materia`

- [ ] **Step 1: Escrever a migração de enums**

`supabase/migrations/0002_enums.sql`:

```sql
create type tipo_depoimento as enum ('APROVACAO', 'ELOGIO', 'TRANSFORMACAO');
create type canal_un as enum ('PRINCIPAL', 'MILITARES', 'SUPERIORES');
create type fonte_depoimento as enum ('GOOGLE_REVIEW', 'GOOGLE_FORMS', 'MANUAL');
create type escala_nota as enum ('PERCENTUAL', 'PONTOS', 'TRI');
create type situacao_resultado as enum ('APROVADO', 'NAO_APROVADO');
create type plataforma_perfil as enum ('GOOGLE', 'INSTAGRAM', 'YOUTUBE', 'PLATAFORMA', 'OUTRO');
create type autorizacao_publicacao as enum ('AUTORIZADO', 'NAO_AUTORIZADO', 'NAO_INFORMADO');
create type status_uso as enum ('DISPONIVEL', 'EM_PRODUCAO', 'FEITO', 'POSTADO', 'DESCARTADO');
create type motivo_descarte as enum ('QUALIDADE_BAIXA', 'SEM_AUTORIZACAO', 'DUPLICADO', 'OUTRO');
```

- [ ] **Step 2: Escrever a migração de referência**

`supabase/migrations/0003_referencia.sql`:

```sql
create table instituicao (
  id            bigint generated always as identity primary key,
  nome_canonico text not null unique,
  logo_path     text,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  constraint ck_instituicao_nome check (btrim(nome_canonico) <> '')
);

create table instituicao_apelido (
  id             bigint generated always as identity primary key,
  instituicao_id bigint not null references instituicao(id) on delete cascade,
  apelido        text not null unique,
  constraint ck_apelido check (btrim(apelido) <> '')
);
create index on instituicao_apelido (instituicao_id);

create table prova (
  id             bigint generated always as identity primary key,
  nome           text not null unique,
  instituicao_id bigint references instituicao(id) on delete set null,
  constraint ck_prova_nome check (btrim(nome) <> '')
);

create table curso (
  id   bigint generated always as identity primary key,
  nome text not null unique,
  constraint ck_curso_nome check (btrim(nome) <> '')
);

create table materia (
  id   bigint generated always as identity primary key,
  nome text not null unique,
  constraint ck_materia_nome check (btrim(nome) <> '')
);
```

`prova.instituicao_id` é nulo para o ENEM e preenchido para o Vestibular do ITA. É o que faz os dois caberem na mesma tabela sem caso especial.

- [ ] **Step 3: Aplicar e ver o teste de catálogo REPROVAR**

Run: `npx supabase db reset && npx vitest run testes/rls/catalogo.test.js`
Expected: **FAIL**, listando as cinco tabelas novas sem RLS.

Esse é o ponto do teste. Ele acaba de pegar exatamente o erro que existe para pegar, na primeira oportunidade que teve.

**Copie a saída da falha para o relatório.** Ela é a evidência de que a varredura funciona, e é o único registro que restará dela.

- [ ] **Step 4: NÃO commitar ainda**

Pela emenda no topo desta tarefa, o commit vem ao fim da Task 6, com a suíte verde. Siga direto para a Task 6.

---

### Task 6: Lista da equipe, função de acesso e políticas

**Files:**
- Create: `supabase/migrations/0004_membro_equipe.sql`, `supabase/migrations/0005_politicas_referencia.sql`, `testes/rls/acesso.test.js`

**Interfaces:**
- Consumes: tabelas da Task 5, auxiliares da Task 4
- Produces: `public.eh_membro_equipe() → boolean`; tabela `membro_equipe(email, nome, ativo)`; padrão de política reaproveitado por todas as tabelas seguintes

- [ ] **Step 1: Escrever o teste da matriz de acesso, antes da implementação**

`testes/rls/acesso.test.js`:

```js
import { describe, it, expect, beforeAll } from 'vitest'
import { conectar, comoAnonimo, comoUsuario } from './ajuda.js'

const MEMBRO = 'membro@exemplo.test'
const INATIVO = 'inativo@exemplo.test'
const ESTRANHO = 'estranho@exemplo.test'

beforeAll(async () => {
  const cliente = await conectar()
  await cliente.query(`
    insert into membro_equipe (email, nome, ativo) values
      ($1, 'Membro Ativo', true),
      ($2, 'Membro Inativo', false)
    on conflict (email) do nothing
  `, [MEMBRO, INATIVO])
  await cliente.query(`
    insert into instituicao (nome_canonico) values ('ITA')
    on conflict do nothing
  `)
  await cliente.end()
})

describe('acesso a instituicao', () => {
  it('visitante sem login nao le nada', async () => {
    const linhas = await comoAnonimo((c) =>
      c.query('select * from instituicao').then((r) => r.rows))
    expect(linhas).toEqual([])
  })

  it('logado fora da lista nao le nada', async () => {
    const linhas = await comoUsuario(ESTRANHO, (c) =>
      c.query('select * from instituicao').then((r) => r.rows))
    expect(linhas).toEqual([])
  })

  it('logado inativo nao le nada', async () => {
    const linhas = await comoUsuario(INATIVO, (c) =>
      c.query('select * from instituicao').then((r) => r.rows))
    expect(linhas).toEqual([])
  })

  it('membro ativo le', async () => {
    const linhas = await comoUsuario(MEMBRO, (c) =>
      c.query('select * from instituicao').then((r) => r.rows))
    expect(linhas.length).toBeGreaterThan(0)
  })

  it('visitante nao escreve', async () => {
    await expect(
      comoAnonimo((c) =>
        c.query(`insert into instituicao (nome_canonico) values ('INVASOR')`))
    ).rejects.toThrow()
  })

  it('ninguem escreve em membro_equipe pela API', async () => {
    await expect(
      comoUsuario(MEMBRO, (c) =>
        c.query(`insert into membro_equipe (email, nome) values ('x@exemplo.test','X')`))
    ).rejects.toThrow()
  })
})
```

O teste que mais importa é o negativo. Que o membro leia se perceberia na hora; que o estranho não leia é o que ninguém percebe até o dia em que percebe.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run testes/rls/acesso.test.js`
Expected: FAIL — `relation "membro_equipe" does not exist`.

- [ ] **Step 3: Escrever a migração de `membro_equipe` e da função**

`supabase/migrations/0004_membro_equipe.sql`:

```sql
create table membro_equipe (
  email     text primary key,
  nome      text not null,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint ck_email check (email = lower(email) and email like '%@%')
);

alter table membro_equipe enable row level security;

-- SECURITY DEFINER para que a politica sobre membro_equipe nao recurse sobre si.
create or replace function public.eh_membro_equipe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from membro_equipe
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and ativo
  );
$$;

-- Membros leem a lista; ninguem escreve pela API.
-- Adicionar ou remover alguem e SQL no painel, conforme docs/runbook-equipe.md.
create policy membro_equipe_leitura on membro_equipe
  for select using (public.eh_membro_equipe());
```

- [ ] **Step 4: Escrever as políticas das tabelas de referência**

`supabase/migrations/0005_politicas_referencia.sql`:

```sql
do $$
declare t text;
begin
  foreach t in array array['instituicao','instituicao_apelido','prova','curso','materia']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all using (public.eh_membro_equipe())
         with check (public.eh_membro_equipe())',
      t || '_equipe', t);
  end loop;
end $$;
```

Uma condição, um lugar para errar, um lugar para corrigir.

- [ ] **Step 5: Blindar a varredura de catálogo contra o falso "limpo"**

> **Emenda pós-aprovação (2026-09-23).** Os dois testes de catálogo afirmam que **nenhuma** tabela está desprotegida. Uma consulta apontada para o schema errado — ou com um filtro digitado errado — também devolve nada, e passaria verde enquanto o banco inteiro estivesse exposto. Um teste que não consegue falhar não é teste.

Acrescente em `testes/rls/catalogo.test.js`:

```js
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
                          'curso', 'materia', 'membro_equipe']) {
    expect(tabelas).toContain(esperada)
  }
})
```

Conforme as tabelas forem nascendo nas Tasks 7, 8 e 10, acrescente os nomes novos a esta lista.

- [ ] **Step 6: Aplicar e ver tudo passar**

Run: `npx supabase db reset && npx vitest run testes/rls`
Expected: PASS nos três testes de `catalogo.test.js` e nos seis de `acesso.test.js`.

- [ ] **Step 7: Commit único das Tasks 5 e 6**

```bash
git add -A
git commit -m "feat(db): enums, tabelas de referencia, membro_equipe e politicas de RLS"
```

---

### Task 7: Tabelas do núcleo e as regras 1, 4, 5, 6 e 7

**Files:**
- Create: `supabase/migrations/0006_nucleo.sql`, `testes/rls/regras_depoimento.test.js`

**Interfaces:**
- Consumes: enums da Task 5, padrão de política da Task 6
- Produces: `aluno`, `aluno_perfil`, `depoimento`, `depoimento_tipo`, `depoimento_canal`

- [ ] **Step 1: Escrever os testes das regras, antes do schema**

`testes/rls/regras_depoimento.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { conectar } from './ajuda.js'

async function inserir(campos) {
  const cliente = await conectar()
  try {
    const colunas = Object.keys(campos)
    const marcadores = colunas.map((_, i) => `$${i + 1}`)
    return await cliente.query(
      `insert into depoimento (${colunas.join(',')})
       values (${marcadores.join(',')}) returning id`,
      Object.values(campos))
  } finally {
    await cliente.end()
  }
}

const BASE = { texto_completo: 'Passei no ITA!', fonte: 'MANUAL' }

describe('regras do depoimento', () => {
  it('regra 1: texto vazio e recusado', async () => {
    await expect(inserir({ ...BASE, texto_completo: '   ' })).rejects.toThrow()
  })

  it('regra 4: descartado sem motivo e recusado', async () => {
    await expect(inserir({ ...BASE, status_uso: 'DESCARTADO' })).rejects.toThrow()
  })

  it('regra 4 ao contrario: motivo em depoimento nao descartado e recusado', async () => {
    await expect(
      inserir({ ...BASE, status_uso: 'DISPONIVEL', motivo_descarte: 'DUPLICADO' })
    ).rejects.toThrow()
  })

  it('regra 5: motivo OUTRO sem observacao e recusado', async () => {
    await expect(
      inserir({ ...BASE, status_uso: 'DESCARTADO', motivo_descarte: 'OUTRO' })
    ).rejects.toThrow()
  })

  it('regra 6: POSTADO sem data e recusado', async () => {
    await expect(inserir({ ...BASE, status_uso: 'POSTADO' })).rejects.toThrow()
  })

  it('regra 6: POSTADO sem link e aceito', async () => {
    const r = await inserir({
      ...BASE, status_uso: 'POSTADO', data_postagem: '2026-09-01',
    })
    expect(r.rows[0].id).toBeDefined()
  })

  it('regra 7: NAO_AUTORIZADO como DISPONIVEL e recusado', async () => {
    await expect(
      inserir({ ...BASE, autorizacao_publicacao: 'NAO_AUTORIZADO' })
    ).rejects.toThrow()
  })

  it('regra 7: NAO_AUTORIZADO so vive como DESCARTADO/SEM_AUTORIZACAO', async () => {
    const r = await inserir({
      ...BASE,
      autorizacao_publicacao: 'NAO_AUTORIZADO',
      status_uso: 'DESCARTADO',
      motivo_descarte: 'SEM_AUTORIZACAO',
    })
    expect(r.rows[0].id).toBeDefined()
  })

  it('regra 7 operacional: mudar so a autorizacao falha', async () => {
    const r = await inserir(BASE)
    const cliente = await conectar()
    await expect(
      cliente.query(
        `update depoimento set autorizacao_publicacao = 'NAO_AUTORIZADO' where id = $1`,
        [r.rows[0].id])
    ).rejects.toThrow()
    await cliente.end()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run testes/rls/regras_depoimento.test.js`
Expected: FAIL — `relation "depoimento" does not exist`.

- [ ] **Step 3: Escrever a migração do núcleo**

`supabase/migrations/0006_nucleo.sql`:

```sql
create table aluno (
  id            bigint generated always as identity primary key,
  nome_exibicao text not null,
  criado_em     timestamptz not null default now(),
  constraint ck_aluno_nome check (btrim(nome_exibicao) <> '')
);

create table aluno_perfil (
  id            bigint generated always as identity primary key,
  aluno_id      bigint not null references aluno(id) on delete cascade,
  plataforma    plataforma_perfil not null,
  identificador text not null,
  url           text
);
create index on aluno_perfil (aluno_id);
create index on aluno_perfil (lower(identificador));

create table depoimento (
  id                     bigint generated always as identity primary key,
  aluno_id               bigint references aluno(id) on delete set null,
  texto_completo         text not null,
  resumo_curto           text,
  autor_bruto            text,
  autor_contato_bruto    text,
  fonte                  fonte_depoimento not null,
  link_original          text,
  data_depoimento        date,
  print_path             text,
  autorizacao_publicacao autorizacao_publicacao not null default 'NAO_INFORMADO',
  status_uso             status_uso not null default 'DISPONIVEL',
  data_postagem          date,
  link_post              text,
  motivo_descarte        motivo_descarte,
  observacao_descarte    text,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now(),

  -- Regra 1
  constraint ck_texto_nao_vazio
    check (btrim(texto_completo) <> ''),

  -- Regra 4, nos dois sentidos: sem o segundo, reverter um descarte
  -- deixaria motivo orfao apontando para um depoimento ativo.
  constraint ck_descarte_motivo
    check ((status_uso = 'DESCARTADO') = (motivo_descarte is not null)),

  -- Regra 5
  constraint ck_motivo_outro
    check (motivo_descarte is distinct from 'OUTRO'
           or coalesce(btrim(observacao_descarte), '') <> ''),

  -- Regra 6: data obrigatoria, link opcional.
  -- Link obrigatorio produziria link de fachada, que e pior que campo vazio.
  constraint ck_postado_data
    check (status_uso <> 'POSTADO' or data_postagem is not null),

  -- Regra 7: DISPONIVEL significa livre para uso, e sem autorizacao
  -- nada esta livre.
  constraint ck_autorizacao
    check (autorizacao_publicacao <> 'NAO_AUTORIZADO'
           or (status_uso = 'DESCARTADO' and motivo_descarte = 'SEM_AUTORIZACAO'))
);
create index on depoimento (aluno_id);
create index on depoimento (status_uso);
create index on depoimento (fonte);

create table depoimento_tipo (
  depoimento_id bigint not null references depoimento(id) on delete cascade,
  tipo          tipo_depoimento not null,
  primary key (depoimento_id, tipo)
);

create table depoimento_canal (
  depoimento_id bigint not null references depoimento(id) on delete cascade,
  canal         canal_un not null,
  primary key (depoimento_id, canal)
);

do $$
declare t text;
begin
  foreach t in array array['aluno','aluno_perfil','depoimento',
                           'depoimento_tipo','depoimento_canal']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all using (public.eh_membro_equipe())
         with check (public.eh_membro_equipe())',
      t || '_equipe', t);
  end loop;
end $$;
```

- [ ] **Step 4: Rodar tudo**

Run: `npx supabase db reset && npx vitest run testes/rls`
Expected: PASS em todos, inclusive no catálogo com as cinco tabelas novas.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): tabelas do nucleo com as regras 1, 4, 5, 6 e 7"
```

---

### Task 8: Participações, notas e resultados — regras 2 e 3 e a coluna gerada

> **Emenda pós-aprovação (2026-09-24).** Mesma convenção registrada na emenda da Task 11:
> fixture de tabela com nome único é sempre upsert idempotente. O código real
> (`testes/rls/regras_nota.test.js`) já usa `on conflict (<coluna única>) do update set
> <coluna> = excluded.<coluna> returning id` para `prova`, `materia` e `instituicao`; o
> texto abaixo foi alinhado a ele.

**Files:**
- Create: `supabase/migrations/0007_participacao.sql`, `testes/rls/regras_nota.test.js`

**Interfaces:**
- Consumes: `depoimento` da Task 7, `prova`/`materia`/`instituicao`/`curso` da Task 5
- Produces: `participacao`, `nota` (com `percentual` gerada), `resultado`

- [ ] **Step 1: Escrever os testes**

`testes/rls/regras_nota.test.js`:

```js
import { describe, it, expect, beforeAll } from 'vitest'
import { conectar } from './ajuda.js'

let idDepoimento, idParticipacao, idMateria, idInstituicao

beforeAll(async () => {
  const c = await conectar()
  const dep = await c.query(
    `insert into depoimento (texto_completo, fonte)
     values ('Gabaritei fisica', 'MANUAL') returning id`)
  idDepoimento = dep.rows[0].id
  const prova = await c.query(
    `insert into prova (nome) values ('ENEM')
     on conflict (nome) do update set nome = excluded.nome
     returning id`)
  const part = await c.query(
    `insert into participacao (depoimento_id, prova_id, ano)
     values ($1, $2, 2025) returning id`, [idDepoimento, prova.rows[0].id])
  idParticipacao = part.rows[0].id
  const mat = await c.query(
    `insert into materia (nome) values ('Fisica')
     on conflict (nome) do update set nome = excluded.nome
     returning id`)
  idMateria = mat.rows[0].id
  const inst = await c.query(
    `insert into instituicao (nome_canonico) values ('UFMG')
     on conflict (nome_canonico) do update set nome_canonico = excluded.nome_canonico
     returning id`)
  idInstituicao = inst.rows[0].id
  await c.end()
})

async function inserirNota(campos) {
  const c = await conectar()
  try {
    return await c.query(
      `insert into nota (participacao_id, materia_id, valor_original, escala, valor_maximo)
       values ($1, $2, $3, $4, $5) returning percentual`,
      [idParticipacao, idMateria, campos.valor, campos.escala, campos.maximo ?? null])
  } finally { await c.end() }
}

describe('nota', () => {
  it('regra 2: PONTOS sem maximo e recusado', async () => {
    await expect(inserirNota({ valor: 18, escala: 'PONTOS' })).rejects.toThrow()
  })

  it('PERCENTUAL: percentual e o proprio valor', async () => {
    const r = await inserirNota({ valor: 100, escala: 'PERCENTUAL' })
    expect(Number(r.rows[0].percentual)).toBe(100)
  })

  it('PONTOS: 18 de 20 vira 90', async () => {
    const r = await inserirNota({ valor: 18, escala: 'PONTOS', maximo: 20 })
    expect(Number(r.rows[0].percentual)).toBe(90)
  })

  it('TRI: nunca vira percentual', async () => {
    const r = await inserirNota({ valor: 820, escala: 'TRI' })
    expect(r.rows[0].percentual).toBeNull()
  })

  it('percentual nao pode ser escrito por codigo', async () => {
    const c = await conectar()
    await expect(
      c.query(`insert into nota
        (participacao_id, materia_id, valor_original, escala, percentual)
        values ($1, $2, 50, 'PERCENTUAL', 99)`, [idParticipacao, idMateria])
    ).rejects.toThrow()
    await c.end()
  })
})

describe('resultado', () => {
  it('regra 3: APROVADO sem instituicao e recusado', async () => {
    const c = await conectar()
    await expect(
      c.query(`insert into resultado (participacao_id, situacao)
               values ($1, 'APROVADO')`, [idParticipacao])
    ).rejects.toThrow()
    await c.end()
  })

  it('NAO_APROVADO sem instituicao e aceito', async () => {
    const c = await conectar()
    const r = await c.query(
      `insert into resultado (participacao_id, situacao)
       values ($1, 'NAO_APROVADO') returning id`, [idParticipacao])
    expect(r.rows[0].id).toBeDefined()
    await c.end()
  })

  it('uma participacao aceita varios resultados', async () => {
    const c = await conectar()
    const r = await c.query(
      `insert into resultado (participacao_id, instituicao_id, situacao)
       values ($1, $2, 'APROVADO') returning id`, [idParticipacao, idInstituicao])
    expect(r.rows[0].id).toBeDefined()
    await c.end()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run testes/rls/regras_nota.test.js`
Expected: FAIL — `relation "participacao" does not exist`.

- [ ] **Step 3: Escrever a migração**

`supabase/migrations/0007_participacao.sql`:

```sql
create table participacao (
  id            bigint generated always as identity primary key,
  depoimento_id bigint not null references depoimento(id) on delete cascade,
  prova_id      bigint not null references prova(id) on delete restrict,
  ano           smallint not null,
  constraint ck_ano check (ano between 1990 and 2100)
);
create index on participacao (depoimento_id);
create index on participacao (ano);

create table nota (
  id              bigint generated always as identity primary key,
  participacao_id bigint not null references participacao(id) on delete cascade,
  materia_id      bigint not null references materia(id) on delete restrict,
  valor_original  numeric(8,2) not null,
  escala          escala_nota not null,
  valor_maximo    numeric(8,2),

  -- Coluna GERADA. Nenhum codigo a escreve, logo ela nao tem como
  -- divergir do valor original. TRI nunca vira percentual.
  percentual numeric(6,2) generated always as (
    case escala
      when 'PERCENTUAL' then valor_original
      when 'PONTOS'     then round(valor_original / valor_maximo * 100, 2)
      else null
    end
  ) stored,

  -- Regra 2: "18 de 20" sem o 20 e dado inutil.
  constraint ck_pontos_exige_maximo
    check (escala <> 'PONTOS' or (valor_maximo is not null and valor_maximo > 0))
);
create index on nota (participacao_id);
create index on nota (materia_id, percentual);

create table resultado (
  id              bigint generated always as identity primary key,
  participacao_id bigint not null references participacao(id) on delete cascade,
  instituicao_id  bigint references instituicao(id) on delete restrict,
  curso_id        bigint references curso(id) on delete set null,
  situacao        situacao_resultado not null,

  -- Regra 3: aprovado em lugar nenhum nao existe.
  constraint ck_aprovado_exige_instituicao
    check (situacao <> 'APROVADO' or instituicao_id is not null)
);
create index on resultado (participacao_id);
create index on resultado (instituicao_id);

do $$
declare t text;
begin
  foreach t in array array['participacao','nota','resultado']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all using (public.eh_membro_equipe())
         with check (public.eh_membro_equipe())',
      t || '_equipe', t);
  end loop;
end $$;
```

- [ ] **Step 4: Rodar tudo**

Run: `npx supabase db reset && npx vitest run testes/rls`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): participacao, nota com coluna gerada e resultado"
```

---

### Task 9: Trigger de transições de status

**Files:**
- Create: `supabase/migrations/0008_transicoes.sql`, `testes/rls/transicoes.test.js`

**Interfaces:**
- Consumes: `depoimento` da Task 7
- Produces: trigger `trg_valida_transicao` em `depoimento`

- [ ] **Step 1: Escrever o teste da matriz 5×5 completa**

Enumerar a matriz inteira, e não só as transições que lembramos, é o que garante que um estado novo no futuro não abra caminho silencioso.

`testes/rls/transicoes.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { conectar } from './ajuda.js'

const ESTADOS = ['DISPONIVEL', 'EM_PRODUCAO', 'FEITO', 'POSTADO', 'DESCARTADO']

const PERMITIDAS = new Set([
  'DISPONIVEL>EM_PRODUCAO',
  'EM_PRODUCAO>FEITO',
  'EM_PRODUCAO>DISPONIVEL',
  'FEITO>POSTADO',
  'FEITO>EM_PRODUCAO',
  'POSTADO>FEITO',
  'DISPONIVEL>DESCARTADO',
  'EM_PRODUCAO>DESCARTADO',
  'FEITO>DESCARTADO',
  'POSTADO>DESCARTADO',
  'DESCARTADO>DISPONIVEL',
])

// Campos que cada estado exige para existir, conforme as regras 4 e 6.
function camposDoEstado(estado) {
  if (estado === 'DESCARTADO') return { motivo_descarte: 'DUPLICADO', data_postagem: null }
  if (estado === 'POSTADO') return { motivo_descarte: null, data_postagem: '2026-09-01' }
  return { motivo_descarte: null, data_postagem: null }
}

async function tentar(de, para) {
  const c = await conectar()
  try {
    const inicial = camposDoEstado(de)
    const final = camposDoEstado(para)
    const dep = await c.query(
      `insert into depoimento (texto_completo, fonte, status_uso, motivo_descarte, data_postagem)
       values ('texto', 'MANUAL', $1, $2, $3) returning id`,
      [de, inicial.motivo_descarte, inicial.data_postagem])
    await c.query(
      `update depoimento set status_uso = $1, motivo_descarte = $2, data_postagem = $3
       where id = $4`,
      [para, final.motivo_descarte, final.data_postagem, dep.rows[0].id])
    return true
  } catch {
    return false
  } finally {
    await c.end()
  }
}

describe('transicoes de status', () => {
  for (const de of ESTADOS) {
    for (const para of ESTADOS) {
      if (de === para) continue
      const chave = `${de}>${para}`
      const esperado = PERMITIDAS.has(chave)
      it(`${chave} ${esperado ? 'e permitida' : 'e recusada'}`, async () => {
        expect(await tentar(de, para)).toBe(esperado)
      })
    }
  }
})

describe('reversoes nomeadas', () => {
  it('EM_PRODUCAO volta para DISPONIVEL: arte abandonada libera o depoimento', async () => {
    expect(await tentar('EM_PRODUCAO', 'DISPONIVEL')).toBe(true)
  })

  it('DESCARTADO volta para DISPONIVEL limpando motivo', async () => {
    expect(await tentar('DESCARTADO', 'DISPONIVEL')).toBe(true)
  })

  it('DESCARTADO nao volta para DISPONIVEL com motivo preenchido', async () => {
    const c = await conectar()
    const dep = await c.query(
      `insert into depoimento (texto_completo, fonte, status_uso, motivo_descarte)
       values ('t', 'MANUAL', 'DESCARTADO', 'DUPLICADO') returning id`)
    await expect(
      c.query(`update depoimento set status_uso = 'DISPONIVEL' where id = $1`,
        [dep.rows[0].id])
    ).rejects.toThrow()
    await c.end()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run testes/rls/transicoes.test.js`
Expected: FAIL — sem trigger, transições proibidas passam.

- [ ] **Step 3: Escrever a migração**

`supabase/migrations/0008_transicoes.sql`:

```sql
-- Transicao depende do valor anterior, que um CHECK nao enxerga.
-- E a unica regra do sistema que exige trigger.
create or replace function public.valida_transicao_status()
returns trigger
language plpgsql
as $$
begin
  if new.status_uso = old.status_uso then
    return new;
  end if;

  if new.status_uso = 'DESCARTADO'
     or (old.status_uso = 'DESCARTADO' and new.status_uso = 'DISPONIVEL')
     or (old.status_uso, new.status_uso) in (
          ('DISPONIVEL',  'EM_PRODUCAO'),
          ('EM_PRODUCAO', 'FEITO'),
          ('EM_PRODUCAO', 'DISPONIVEL'),
          ('FEITO',       'POSTADO'),
          ('FEITO',       'EM_PRODUCAO'),
          ('POSTADO',     'FEITO')
        )
  then
    return new;
  end if;

  raise exception 'transicao de status invalida: % -> %', old.status_uso, new.status_uso
    using errcode = 'check_violation';
end $$;

create trigger trg_valida_transicao
  before update of status_uso on depoimento
  for each row execute function public.valida_transicao_status();
```

- [ ] **Step 4: Rodar**

Run: `npx supabase db reset && npx vitest run testes/rls`
Expected: PASS nas 20 células da matriz e nas três reversões nomeadas.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): trigger de transicoes de status com teste da matriz 5x5"
```

---

### Task 10: Buckets de prints e logos, com políticas opostas

**Files:**
- Create: `supabase/migrations/0009_storage.sql`, `testes/rls/storage.test.js`

**Interfaces:**
- Produces: buckets `prints` (privado) e `logos` (leitura pública, escrita restrita)

- [ ] **Step 1: Escrever o teste**

`testes/rls/storage.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { conectar } from './ajuda.js'

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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run testes/rls/storage.test.js`
Expected: FAIL — buckets não existem.

- [ ] **Step 3: Escrever a migração**

`supabase/migrations/0009_storage.sql`:

```sql
-- Dois buckets por argumento de raio de explosao: um erro na politica de
-- logos (a mais frouxa) nao pode alcancar um print (o dado mais sensivel).
insert into storage.buckets (id, name, public)
values ('prints', 'prints', false),
       ('logos',  'logos',  true)
on conflict (id) do nothing;

-- Prints: leitura so para a equipe. URL assinada e gerada pelo cliente.
create policy prints_leitura on storage.objects
  for select using (bucket_id = 'prints' and public.eh_membro_equipe());

create policy prints_escrita on storage.objects
  for insert with check (bucket_id = 'prints' and public.eh_membro_equipe());

create policy prints_remocao on storage.objects
  for delete using (bucket_id = 'prints' and public.eh_membro_equipe());

-- Logos: leitura publica (marca de instituicao nao e dado sensivel, e a lista
-- renderiza dezenas por pagina). Escrita restrita: bucket publico onde
-- qualquer um grava e defacement esperando acontecer.
create policy logos_escrita on storage.objects
  for insert with check (bucket_id = 'logos' and public.eh_membro_equipe());

create policy logos_remocao on storage.objects
  for delete using (bucket_id = 'logos' and public.eh_membro_equipe());
```

- [ ] **Step 4: Rodar tudo e fechar o Marco 1**

Run: `npx supabase db reset && npm test`
Expected: PASS em toda a suíte.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): buckets prints (privado) e logos (publico) com politicas"
```

---

# Marco 2 — Busca: a função SQL e a semântica dos filtros

**Entrega ao fim do marco:** a consulta que dá razão de existir ao sistema, provada contra a semântica errada. Vem antes da interface porque é onde mora o risco.

---

### Task 11: Função de busca com semântica de depoimento

> **Emenda pós-aprovação (2026-09-24).** Os inserts simples de `materia 'Fisica'`,
> `instituicao 'ITA'` e `prova 'ENEM'` no Step 1 abaixo colidem com as fixtures que o
> Marco 1 já grava (`acesso.test.js`, `regras_nota.test.js`) — unique violation certa
> depois de qualquer execução anterior, e intermitente logo após `db reset` porque o
> vitest roda arquivos de teste em paralelo. Trocados por
> `insert ... on conflict (<coluna única>) do update set <coluna> = excluded.<coluna>
> returning id`, como `regras_nota.test.js` já faz. Convenção registrada aqui para
> todo o plano: **fixture de tabela com nome único é sempre upsert idempotente.**
> Pelo mesmo motivo, o insert de `'Vestibular do ITA'` no Step 1 abaixo vira
> upsert em `(nome)`, também atualizando `instituicao_id = excluded.instituicao_id`
> — sem isso, uma segunda execução recriaria a prova ligada à instituição errada
> se `idIta` mudasse entre execuções.
>
> **Fix round 1 (2026-09-24).** Revisão pós-implementação de `0010_busca.sql`
> encontrou: (1) o contrato "ausente ou `null` significa não filtra" não valia
> para `null` explícito — uma chave escalar (`texto`, `ano`, `tem_print`) com
> `null` explícito produzia 0 linhas em silêncio, e uma chave de array
> (`tipos`, `fontes`, `status`, `canais`, `provas`, `instituicoes`, `cursos`,
> `notas`, `tri`) com `null` explícito derrubava a chamada com
> `cannot extract elements from a scalar`; (2) lista vazia `[]` também não
> valia como "não filtra" nas 7 famílias que usam `IN (select
> jsonb_array_elements_text(...))` (`notas`/`tri` já se comportavam certo por
> construção do `NOT EXISTS`); (3) `%`, `_` e `\` em `texto` agiam como coringa
> do `ILIKE` em vez de busca literal; (4) a função não tinha `set search_path
> = ''` nem tabelas qualificadas por `public.`, inconsistente com
> `eh_membro_equipe()` e `tocar_atualizado_em()`. Corrigidos normalizando
> `p_filtros` uma única vez (`jsonb_strip_nulls(coalesce(p_filtros,
> '{}'::jsonb))`, guardado numa variável `filtros` — a função virou `language
> plpgsql` por causa disso e do `raise exception` do operador, abaixo),
> trocando toda guarda de array por `coalesce(jsonb_array_length(filtros->'x'),
> 0) = 0`, escapando `texto` antes do `ILIKE`, e adicionando `set search_path
> = ''` com toda tabela qualificada (`public.depoimento`,
> `public.participacao`, `public.nota`, `public.resultado`,
> `public.depoimento_tipo`, `public.depoimento_canal`; retorno `setof
> public.depoimento`).
>
> No mesmo round, dois campos novos em `p_filtros` (Task 12 e Task 21
> consomem — ver bloco JSON abaixo):
> - cada item de `notas` aceita `"operador": "=" | ">="` (ausente ⇒ `">="`,
>   igual ao comportamento anterior). Qualquer outro valor derruba a chamada
>   com `raise exception 'operador invalido: %'` — falha cedo com causa
>   clara, em vez de tratar silenciosamente como `>=`. `tri` não ganhou
>   operador — continua sempre `>=`.
> - `"ano_de"` e `"ano_ate"`: faixa inclusiva, cada lado opcional,
>   satisfeita por uma única participação (`ano between coalesce(ano_de,
>   -32768) and coalesce(ano_ate, 32767)` — limites de `smallint`, mesma
>   coluna e mesma linha de `participacao`, nunca uma participação para cada
>   lado). `"ano"` (igualdade exata) continua existindo, independente dos
>   dois.
>
> Não foi adicionado filtro de "tem link" — decisão de produto pendente com
> o dono.
>
> **Limites conhecidos para quem monta `p_filtros` (Task 12): a função não
> tolera forma malformada — elemento `null` dentro de um array, ou item de
> `notas`/`tri` sem `minimo`, casam com nada (silenciosamente); um escalar no
> lugar de um array, ou um `ano`/`ano_de`/`ano_ate` que não seja inteiro,
> derrubam a chamada com erro — a lib em `src/lib` nunca deve montar
> `p_filtros` assim.**
>
> O Step 3 abaixo (SQL original aprovado) **não foi reescrito** — está
> superado por este fix round. `supabase/migrations/0010_busca.sql` é a
> fonte da verdade da implementação; ver `testes/rls/busca_fix1.test.js`
> para os testes de regressão de cada item acima.

**Files:**
- Create: `supabase/migrations/0010_busca.sql`, `testes/rls/busca.test.js`

**Interfaces:**
- Produces: `public.buscar_depoimentos(p_filtros jsonb) → setof depoimento`

Formato de `p_filtros`, usado pela Task 12 e pela interface:

```json
{
  "texto": "ITA",
  "tipos": ["APROVACAO"],
  "canais": ["MILITARES"],
  "fontes": ["GOOGLE_REVIEW"],
  "status": ["DISPONIVEL"],
  "instituicoes": [1, 2],
  "provas": [3],
  "cursos": [4],
  "ano": 2025,
  "ano_de": 2024,
  "ano_ate": 2025,
  "notas": [{ "materia_id": 1, "minimo": 100, "operador": "=" }],
  "tri": [{ "materia_id": 2, "minimo": 900 }],
  "tem_print": true
}
```

Todo campo é opcional; ausente ou `null` significa "não filtra por isso";
lista vazia (`[]`) também significa "não filtra por isso", em toda família
de filtro. `ano_de`/`ano_ate` combinam entre si (faixa inclusiva, satisfeita
por uma única participação); `ano` continua sendo igualdade exata,
independente dos dois. Cada item de `notas` aceita `"operador": "=" | ">="`
(ausente ⇒ `">="`); `tri` não tem operador, é sempre `>=`. Ver o fix round 1
acima.

- [ ] **Step 1: Escrever o teste que trava a semântica**

É a única asserção que separa o comportamento correto do plausível.

`testes/rls/busca.test.js`:

```js
import { describe, it, expect, beforeAll } from 'vitest'
import { conectar } from './ajuda.js'

let idFisica, idMatematica, idIta, idDepoimento

beforeAll(async () => {
  const c = await conectar()
  idFisica = (await c.query(
    `insert into materia (nome) values ('Fisica')
     on conflict (nome) do update set nome = excluded.nome
     returning id`)).rows[0].id
  idMatematica = (await c.query(
    `insert into materia (nome) values ('Matematica')
     on conflict (nome) do update set nome = excluded.nome
     returning id`)).rows[0].id
  idIta = (await c.query(
    `insert into instituicao (nome_canonico) values ('ITA')
     on conflict (nome_canonico) do update set nome_canonico = excluded.nome_canonico
     returning id`)).rows[0].id

  const enem = (await c.query(
    `insert into prova (nome) values ('ENEM')
     on conflict (nome) do update set nome = excluded.nome
     returning id`)).rows[0].id
  const vestIta = (await c.query(
    `insert into prova (nome, instituicao_id) values ('Vestibular do ITA', $1)
     on conflict (nome) do update set instituicao_id = excluded.instituicao_id
     returning id`, [idIta])).rows[0].id

  // Um depoimento, DUAS participacoes:
  // a nota esta numa, a aprovacao esta na outra.
  idDepoimento = (await c.query(
    `insert into depoimento (texto_completo, fonte)
     values ('Gabaritei fisica no ENEM e passei no ITA', 'MANUAL') returning id`)
  ).rows[0].id

  const pEnem = (await c.query(
    `insert into participacao (depoimento_id, prova_id, ano)
     values ($1, $2, 2025) returning id`, [idDepoimento, enem])).rows[0].id
  await c.query(
    `insert into nota (participacao_id, materia_id, valor_original, escala)
     values ($1, $2, 100, 'PERCENTUAL')`, [pEnem, idFisica])

  const pIta = (await c.query(
    `insert into participacao (depoimento_id, prova_id, ano)
     values ($1, $2, 2025) returning id`, [idDepoimento, vestIta])).rows[0].id
  await c.query(
    `insert into resultado (participacao_id, instituicao_id, situacao)
     values ($1, $2, 'APROVADO')`, [pIta, idIta])

  await c.end()
})

async function buscar(filtros) {
  const c = await conectar()
  try {
    const { rows } = await c.query(
      'select id from buscar_depoimentos($1::jsonb)', [JSON.stringify(filtros)])
    return rows.map((r) => Number(r.id))
  } finally { await c.end() }
}

describe('semantica dos filtros', () => {
  it('ENCONTRA com 100% em fisica E aprovado no ITA, em participacoes diferentes', async () => {
    const achados = await buscar({
      notas: [{ materia_id: idFisica, minimo: 100 }],
      instituicoes: [idIta],
    })
    expect(achados).toContain(Number(idDepoimento))
  })

  it('encontra so com a nota', async () => {
    expect(await buscar({ notas: [{ materia_id: idFisica, minimo: 100 }] }))
      .toContain(Number(idDepoimento))
  })

  it('encontra so com a instituicao', async () => {
    expect(await buscar({ instituicoes: [idIta] })).toContain(Number(idDepoimento))
  })

  it('NAO encontra com 100% em matematica e aprovado no ITA', async () => {
    expect(await buscar({
      notas: [{ materia_id: idMatematica, minimo: 100 }],
      instituicoes: [idIta],
    })).not.toContain(Number(idDepoimento))
  })

  it('filtro de ano nao exige coincidencia com a instituicao', async () => {
    expect(await buscar({ ano: 2025, instituicoes: [idIta] }))
      .toContain(Number(idDepoimento))
  })
})
```

A primeira asserção é a que importa. Uma implementação por `JOIN` ingênuo passa nas outras quatro e reprova só nela.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run testes/rls/busca.test.js`
Expected: FAIL — `function buscar_depoimentos does not exist`.

- [ ] **Step 3: Escrever a função**

`supabase/migrations/0010_busca.sql`:

```sql
-- SECURITY INVOKER (padrao): a RLS continua valendo dentro da funcao.
create or replace function public.buscar_depoimentos(p_filtros jsonb default '{}'::jsonb)
returns setof depoimento
language sql
stable
as $$
  select d.*
  from depoimento d
  where
    -- Cada condicao e um EXISTS independente sobre as participacoes do
    -- depoimento. O AND acontece no nivel do depoimento, NAO da participacao.
    (p_filtros->'texto' is null
      or d.texto_completo ilike '%' || (p_filtros->>'texto') || '%'
      or coalesce(d.resumo_curto, '') ilike '%' || (p_filtros->>'texto') || '%')

    and (p_filtros->'fontes' is null
      or d.fonte::text in (select jsonb_array_elements_text(p_filtros->'fontes')))

    and (p_filtros->'status' is null
      or d.status_uso::text in (select jsonb_array_elements_text(p_filtros->'status')))

    and (p_filtros->'tipos' is null or exists (
      select 1 from depoimento_tipo dt
      where dt.depoimento_id = d.id
        and dt.tipo::text in (select jsonb_array_elements_text(p_filtros->'tipos'))))

    and (p_filtros->'canais' is null or exists (
      select 1 from depoimento_canal dc
      where dc.depoimento_id = d.id
        and dc.canal::text in (select jsonb_array_elements_text(p_filtros->'canais'))))

    and (p_filtros->'ano' is null or exists (
      select 1 from participacao p
      where p.depoimento_id = d.id and p.ano = (p_filtros->>'ano')::smallint))

    and (p_filtros->'provas' is null or exists (
      select 1 from participacao p
      where p.depoimento_id = d.id
        and p.prova_id in (
          select (jsonb_array_elements_text(p_filtros->'provas'))::bigint)))

    and (p_filtros->'instituicoes' is null or exists (
      select 1 from participacao p
      join resultado r on r.participacao_id = p.id
      where p.depoimento_id = d.id
        and r.situacao = 'APROVADO'
        and r.instituicao_id in (
          select (jsonb_array_elements_text(p_filtros->'instituicoes'))::bigint)))

    and (p_filtros->'cursos' is null or exists (
      select 1 from participacao p
      join resultado r on r.participacao_id = p.id
      where p.depoimento_id = d.id
        and r.curso_id in (
          select (jsonb_array_elements_text(p_filtros->'cursos'))::bigint)))

    -- N condicoes de nota somadas: "nao existe condicao insatisfeita".
    -- Resolve numero arbitrario de condicoes com SQL estatico.
    and (p_filtros->'notas' is null or not exists (
      select 1 from jsonb_array_elements(p_filtros->'notas') cond
      where not exists (
        select 1 from participacao p
        join nota n on n.participacao_id = p.id
        where p.depoimento_id = d.id
          and n.materia_id = (cond->>'materia_id')::bigint
          and n.percentual is not null
          and n.percentual >= (cond->>'minimo')::numeric)))

    -- TRI e familia separada: nunca vira percentual, filtro proprio.
    and (p_filtros->'tri' is null or not exists (
      select 1 from jsonb_array_elements(p_filtros->'tri') cond
      where not exists (
        select 1 from participacao p
        join nota n on n.participacao_id = p.id
        where p.depoimento_id = d.id
          and n.escala = 'TRI'
          and n.materia_id = (cond->>'materia_id')::bigint
          and n.valor_original >= (cond->>'minimo')::numeric)))

    and (p_filtros->'tem_print' is null
      or (p_filtros->>'tem_print')::boolean = (d.print_path is not null))
  order by d.criado_em desc;
$$;
```

- [ ] **Step 4: Rodar**

Run: `npx supabase db reset && npx vitest run testes/rls/busca.test.js`
Expected: PASS nas cinco asserções.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): buscar_depoimentos com semantica de nivel de depoimento"
```

---

### Task 12: Montagem de filtros em `src/lib`

> **Emenda pós-aprovação (2026-09-24).** O contrato de `p_filtros` mudou
> depois deste plano ter sido escrito (ver a emenda 2026-09-24 na Task 11
> acima e `supabase/migrations/0010_busca.sql`, fonte da verdade). Três
> acréscimos sobre os Steps 1/3 abaixo:
> 1. **Faixa de ano.** `ESTADO_VAZIO` ganha `anoDe: null, anoAte: null`.
>    `montarFiltros` emite `ano_de`/`ano_ate` quando presentes (inteiros,
>    independentes de `ano`); a URL usa as mesmas chaves `ano_de`/`ano_ate`;
>    ida e volta preservada.
> 2. **Operador da condição de nota.** Um item de `notas` no estado pode
>    trazer `operador: '=' | '>='`. `montarFiltros` só repassa o operador
>    para condições de PERCENTUAL quando ele é `'='` (omite quando `'>='`
>    ou ausente — mantendo a saída esperada pelos testes originais deste
>    arquivo inalterada); condições de TRI nunca carregam operador (a
>    função ignora e é sempre `>=`). Na URL, o item
>    `materia_id:minimo:familia` vira `materia_id:minimo:familia:operador`
>    de forma retrocompatível — um item de 3 partes ainda é reconhecido,
>    com operador ausente (sem chave `operador` no objeto resultante, não
>    `operador: undefined`). Ida e volta preservada.
> 3. **Montagem defensiva.** Para respeitar os limites conhecidos do
>    chamador de `buscar_depoimentos` (Task 11): descarta condição de
>    nota/tri cujo `materia_id` ou `minimo` não seja número finito; nunca
>    emite elemento `null` dentro de uma lista; trata texto vazio/só
>    espaço e número não numérico vindos de uma URL editada à mão como
>    ausente (ex.: `?ano=` ou `?ano=abc` → `ano` nulo;
>    `instituicoes=1,,x` → `[1]`).
>
> `src/lib/filtros.js` supera os blocos de código do Step 3 abaixo — eles
> não foram reescritos aqui; a implementação real (com os três itens
> acima) e os testes de regressão de cada um estão em
> `testes/lib/filtros.test.js`.

> **Fix round 1 (2026-09-24).** Revisão pós-implementação encontrou dois
> problemas: (1) `Number('')` e `Number('  ')` são `0`, não `NaN` — um
> segmento vazio ou só espaço num item de `notas` na URL (`notas=:900:TRI`)
> virava `materia_id: 0`, que passava pela guarda de "número finito" da
> montagem defensiva acima. Corrigido tratando segmento vazio/espaço como
> `NaN` antes de checar validade, tanto na leitura de `notas` da URL quanto
> — pela mesma guarda — em `filtrosParaUrl`, que agora também descarta
> condição inválida em vez de serializá-la. (2) Operador desconhecido
> (fora de `'='`/`'>='`/ausente) era silenciosamente tratado como ausente
> nas duas funções, escondendo um bug de quem monta o estado. Corrigido
> com origem definindo o comportamento — a mesma distinção que o resto do
> arquivo já faz entre estado da UI e URL editada à mão:
> - `montarFiltros` (estado vem do nosso próprio código): operador
>   inválido é bug do chamador → lança `Error('operador invalido: ' +
>   valor)`, falha cedo, mesma filosofia do `raise exception` da função
>   SQL (Task 11).
> - `urlParaFiltros` (URL pode ter sido editada à mão, entrada não
>   confiável): 4º segmento desconhecido é descartado — a condição
>   continua valendo, só sem `operador` — nunca lança.
>
> Testes de regressão de cada item em `testes/lib/filtros.test.js`.

> **Fix round 2 (Marco 2, 2026-09-24).** Revisão do Marco 2 encontrou mais dois problemas,
> corrigidos junto (ver `.superpowers/sdd/2026-09-23-nucleo-depoimentos/marco-2-fix-report.md`):
> (1) uma URL editada à mão ainda derrubava a busca com erro de banco em vez de tratar como
> ausente — `instituicoes=1.5`/`provas=1e30` (não são `Number.isSafeInteger`), `ano=99999`/
> `ano_de=-40000` (fora da faixa 1990-2100 de `ck_ano`), `notas=1.5:90:PERCENTUAL` (materia_id
> decimal → erro de bigint), `notas=1:90:FOO` (família desconhecida caindo no grupo PERCENTUAL
> por engano) e `print=sim` (virava `false` em vez de `null`). Corrigido centralizando a coerção
> numérica (`paraNumero`) e aplicando as mesmas regras — id exige `Number.isSafeInteger(n) &&
> n > 0`, ano exige a faixa de `ck_ano` — tanto em `urlParaFiltros` quanto em `montarFiltros`
> (defesa em profundidade contra string de formulário, ex.: `'7'`). Os helpers de coerção/parsing
> de URL foram extraídos para `src/lib/normalizarFiltros.js`, módulo irmão, porque `filtros.js`
> tinha passado de ~300 linhas com essas correções.
> (2) `ESTADO_VAZIO` só congelava o objeto, não os arrays internos: uma cópia rasa
> (`{ ...ESTADO_VAZIO }`) ainda compartilhava os mesmos arrays, e `copia.tipos.push(...)` mutava
> o `ESTADO_VAZIO` de todo mundo. Cada array interno agora é congelado individualmente, e uma
> nova função `estadoVazio()` devolve uma cópia nova e mutável. **A Task 21 (`PainelFiltros.vue`,
> botão de limpar filtros) deve usar `estadoVazio()` para montar o estado limpo — nunca
> `{ ...ESTADO_VAZIO }` nem mutar `ESTADO_VAZIO` diretamente.**

**Files:**
- Create: `src/lib/filtros.js`, `testes/lib/filtros.test.js`

**Interfaces:**
- Produces: `montarFiltros(estado) → objeto`, `filtrosParaUrl(estado) → string`, `urlParaFiltros(string) → estado`, `ESTADO_VAZIO`

- [ ] **Step 1: Escrever o teste**

`testes/lib/filtros.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { montarFiltros, filtrosParaUrl, urlParaFiltros, ESTADO_VAZIO } from '../../src/lib/filtros.js'

describe('montarFiltros', () => {
  it('estado vazio vira objeto vazio', () => {
    expect(montarFiltros(ESTADO_VAZIO)).toEqual({})
  })

  it('omite listas vazias em vez de mandar array vazio', () => {
    expect(montarFiltros({ ...ESTADO_VAZIO, tipos: [] })).toEqual({})
  })

  it('a aba vira filtro de fonte', () => {
    expect(montarFiltros({ ...ESTADO_VAZIO, aba: 'GOOGLE_REVIEW' }))
      .toEqual({ fontes: ['GOOGLE_REVIEW'] })
  })

  it('a aba Todos nao filtra fonte', () => {
    expect(montarFiltros({ ...ESTADO_VAZIO, aba: 'TODOS' })).toEqual({})
  })

  it('separa condicoes de percentual das de TRI', () => {
    const estado = {
      ...ESTADO_VAZIO,
      notas: [
        { materia_id: 1, minimo: 100, familia: 'PERCENTUAL' },
        { materia_id: 2, minimo: 900, familia: 'TRI' },
      ],
    }
    expect(montarFiltros(estado)).toEqual({
      notas: [{ materia_id: 1, minimo: 100 }],
      tri: [{ materia_id: 2, minimo: 900 }],
    })
  })
})

describe('ida e volta pela URL', () => {
  it('preserva o estado', () => {
    const estado = {
      ...ESTADO_VAZIO,
      aba: 'GOOGLE_REVIEW',
      texto: 'ITA',
      tipos: ['APROVACAO'],
      instituicoes: [7],
      ano: 2025,
      notas: [{ materia_id: 1, minimo: 90, familia: 'PERCENTUAL' }],
    }
    expect(urlParaFiltros(filtrosParaUrl(estado))).toEqual(estado)
  })

  it('URL vazia devolve o estado vazio', () => {
    expect(urlParaFiltros('')).toEqual(ESTADO_VAZIO)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run testes/lib/filtros.test.js`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

`src/lib/filtros.js`:

```js
export const ESTADO_VAZIO = Object.freeze({
  aba: 'TODOS',
  texto: '',
  tipos: [],
  canais: [],
  status: [],
  instituicoes: [],
  provas: [],
  cursos: [],
  ano: null,
  notas: [],
  temPrint: null,
})

const LISTAS = {
  tipos: 'tipos',
  canais: 'canais',
  status: 'status',
  instituicoes: 'instituicoes',
  provas: 'provas',
  cursos: 'cursos',
}

export function montarFiltros(estado) {
  const filtros = {}

  if (estado.aba && estado.aba !== 'TODOS') filtros.fontes = [estado.aba]
  if (estado.texto?.trim()) filtros.texto = estado.texto.trim()
  if (estado.ano != null) filtros.ano = estado.ano
  if (estado.temPrint != null) filtros.tem_print = estado.temPrint

  for (const [campo, chave] of Object.entries(LISTAS)) {
    if (estado[campo]?.length) filtros[chave] = [...estado[campo]]
  }

  // Percentual e TRI sao familias separadas: TRI nunca vira percentual,
  // e misturar as duas num filtro so produziria resultado errado em silencio.
  const percentual = (estado.notas ?? []).filter((n) => n.familia !== 'TRI')
  const tri = (estado.notas ?? []).filter((n) => n.familia === 'TRI')
  if (percentual.length) {
    filtros.notas = percentual.map((n) => ({ materia_id: n.materia_id, minimo: n.minimo }))
  }
  if (tri.length) {
    filtros.tri = tri.map((n) => ({ materia_id: n.materia_id, minimo: n.minimo }))
  }

  return filtros
}

export function filtrosParaUrl(estado) {
  const params = new URLSearchParams()
  if (estado.aba && estado.aba !== 'TODOS') params.set('aba', estado.aba)
  if (estado.texto?.trim()) params.set('q', estado.texto.trim())
  if (estado.ano != null) params.set('ano', String(estado.ano))
  if (estado.temPrint != null) params.set('print', String(estado.temPrint))
  for (const campo of Object.keys(LISTAS)) {
    if (estado[campo]?.length) params.set(campo, estado[campo].join(','))
  }
  if (estado.notas?.length) {
    params.set('notas', estado.notas
      .map((n) => `${n.materia_id}:${n.minimo}:${n.familia ?? 'PERCENTUAL'}`)
      .join(','))
  }
  return params.toString()
}

export function urlParaFiltros(texto) {
  const params = new URLSearchParams(texto)
  const numeros = (chave) =>
    params.get(chave) ? params.get(chave).split(',').map(Number) : []
  const textos = (chave) =>
    params.get(chave) ? params.get(chave).split(',') : []

  return {
    ...ESTADO_VAZIO,
    aba: params.get('aba') ?? 'TODOS',
    texto: params.get('q') ?? '',
    tipos: textos('tipos'),
    canais: textos('canais'),
    status: textos('status'),
    instituicoes: numeros('instituicoes'),
    provas: numeros('provas'),
    cursos: numeros('cursos'),
    ano: params.get('ano') ? Number(params.get('ano')) : null,
    temPrint: params.get('print') ? params.get('print') === 'true' : null,
    notas: params.get('notas')
      ? params.get('notas').split(',').map((item) => {
          const [materia_id, minimo, familia] = item.split(':')
          return { materia_id: Number(materia_id), minimo: Number(minimo), familia }
        })
      : [],
  }
}
```

- [ ] **Step 4: Rodar**

Run: `npx vitest run testes/lib/filtros.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(lib): montagem de filtros e serializacao na URL"
```

---

# Marco 3 — Acesso e cadastros de referência

**Entrega ao fim do marco:** login funcionando e a equipe conseguindo cadastrar instituições com logo, apelidos e mesclagem. É o primeiro marco com tela de verdade.

---

### Task 13 — MANUAL (Bernardo): projeto Supabase e login Google

> **Emenda pós-aprovação (2026-09-24).** O Step 3 (ligar o Google no painel) precisa replicar no hospedado o que o M1-A já fez no `config.toml` local para "login só pelo Google", ou o painel hospedado fica mais permissivo que o local. Em **Authentication → Providers**, além de ligar o Google: desligar **"Enable Email provider"** (não confundir com "Allow new users to sign up", que deve continuar **ligado** — é o global que permite o primeiro login do Google criar o usuário); conferir que **Phone** e **Anonymous** continuam desligados; e, no provedor de e-mail (mesmo desligado), deixar **"Confirm email"** e **"Secure email change"** ligados. Motivo em uma frase: `eh_membro_equipe()` confia no e-mail do JWT, e só um provedor único (Google) com e-mail comprovado garante que esse e-mail não foi forjado (ver invariante "Login só pelo Google" no CLAUDE.md).

**Files:** nenhum.

**Interfaces:**
- Produces: projeto Supabase em produção, credenciais para os Secrets

- [ ] **Step 1: Criar o projeto Supabase**

1. <https://supabase.com/dashboard> → **New project**
2. Nome: `un-provas-sociais`. Região: `South America (São Paulo)`
3. Guardar a senha do banco num gerenciador de senhas — ela aparece uma vez só
4. Em **Settings → API**, copiar a **Project URL** e a **anon key**

- [ ] **Step 2: Criar o OAuth client no Google Cloud**

1. <https://console.cloud.google.com/> → criar projeto `un-provas-sociais`
2. **APIs e serviços → Tela de permissão OAuth** → tipo **Externo**
3. Preencher nome do app, e-mail de suporte e e-mail do desenvolvedor
4. **Publicar o app em "Em produção"**, com escopos básicos. Não pedir verificação.

> **Por que "Em produção" importa duas vezes:** em "Modo de teste" o login só funciona para uma lista de usuários de teste, **e** o refresh token do backup (Task 24, Rota B) expira a cada 7 dias. Publicar resolve os dois de uma vez.

5. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**
6. Em **URIs de redirecionamento autorizados**, colar a URL de callback que o Supabase mostra em **Authentication → Providers → Google**
7. Copiar o **Client ID** e o **Client Secret**

- [ ] **Step 3: Ligar o Google no Supabase**

No painel do Supabase, **Authentication → Providers → Google**: habilitar, colar Client ID e Client Secret, salvar. O secret fica no painel, nunca no repositório.

- [ ] **Step 4: Cadastrar os membros da equipe**

**SQL Editor** do Supabase:

```sql
insert into membro_equipe (email, nome, ativo) values
  ('bernardo.costa@universonarrado.com', 'Bernardo', true);
-- repetir para cada pessoa da equipe
```

E-mails em minúsculas — há um `CHECK` que exige isso.

- [ ] **Step 5: Aplicar as migrações em produção**

```bash
npx supabase link --project-ref <ref-do-projeto>
npx supabase db push
```

- [ ] **Step 6: Cadastrar os Secrets no GitHub**

Em **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Onde achar |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon key |

---

### Task 14: Cliente Supabase e login

**Files:**
- Create: `src/dados/cliente.js`, `src/dados/sessao.js`, `src/telas/Login.vue`, `.env.example`
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: credenciais da Task 13
- Produces: `supabase` (cliente), `usuarioAtual()`, `entrarComGoogle()`, `sair()`, `aoMudarSessao(callback)`

- [ ] **Step 1: Criar `.env.example`**

```bash
# Copie para .env e preencha. O .env nunca vai para o Git.
# A anon key NAO e segredo: ela aparece no bundle publicado, por design.
# Quem protege o dado e a RLS.
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

- [ ] **Step 2: Escrever o cliente**

`src/dados/cliente.js`:

```js
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !chave) {
  throw new Error(
    'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY faltando. Copie .env.example para .env.')
}

export const supabase = createClient(url, chave)
```

`src/dados/sessao.js`:

```js
import { supabase } from './cliente.js'

export async function usuarioAtual() {
  const { data } = await supabase.auth.getUser()
  return data?.user ?? null
}

export async function entrarComGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
  })
  if (error) throw error
}

export async function sair() {
  await supabase.auth.signOut()
}

export function aoMudarSessao(callback) {
  return supabase.auth.onAuthStateChange((_evento, sessao) => callback(sessao))
}
```

- [ ] **Step 3: Tela de login e guarda no `App.vue`**

`src/telas/Login.vue`:

```vue
<script setup>
import { entrarComGoogle } from '../dados/sessao.js'
</script>

<template>
  <section>
    <h1>UN Provas Sociais</h1>
    <p>Acesso restrito à equipe.</p>
    <button @click="entrarComGoogle">Entrar com Google</button>
  </section>
</template>
```

`src/App.vue`:

```vue
<script setup>
import { ref, onMounted } from 'vue'
import { usuarioAtual, aoMudarSessao, sair } from './dados/sessao.js'
import Login from './telas/Login.vue'

const usuario = ref(null)
const carregando = ref(true)

onMounted(async () => {
  usuario.value = await usuarioAtual()
  carregando.value = false
  aoMudarSessao((sessao) => { usuario.value = sessao?.user ?? null })
})
</script>

<template>
  <p v-if="carregando">Carregando…</p>
  <Login v-else-if="!usuario" />
  <main v-else>
    <header>
      <span>{{ usuario.email }}</span>
      <button @click="sair">Sair</button>
    </header>
    <p>Autenticado.</p>
  </main>
</template>
```

> A tela de login **não** é a barreira de segurança. Esconder a interface não esconde o dado: a `anon key` está no bundle e qualquer um chama a API. Quem barra é a RLS do Marco 1.

- [ ] **Step 4: Verificar à mão**

Run: `npm run dev`
Expected: com `.env` preenchido, o login com Google funciona e o e-mail aparece no topo. Com um e-mail fora de `membro_equipe`, o login passa mas nenhuma consulta retorna dado — que é o comportamento correto.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: cliente supabase e login com Google"
```

---

### Task 15: Normalização e busca de instituição por apelido

**Files:**
- Create: `src/lib/instituicoes.js`, `testes/lib/instituicoes.test.js`

**Interfaces:**
- Produces: `normalizar(texto)`, `combina(instituicao, termo)`, `ordenarPorRelevancia(lista, termo)`

- [ ] **Step 1: Escrever o teste**

`testes/lib/instituicoes.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { normalizar, combina, ordenarPorRelevancia } from '../../src/lib/instituicoes.js'

const ITA = {
  id: 1,
  nome_canonico: 'Instituto Tecnológico de Aeronáutica',
  apelidos: ['ITA', 'Tecnológico de Aeronáutica'],
}
const UFMG = { id: 2, nome_canonico: 'Universidade Federal de Minas Gerais', apelidos: ['UFMG'] }

describe('normalizar', () => {
  it('remove acento e caixa', () => {
    expect(normalizar('Aeronáutica')).toBe('aeronautica')
  })
  it('colapsa espaco', () => {
    expect(normalizar('  ITA   Sao   Jose ')).toBe('ita sao jose')
  })
})

describe('combina', () => {
  it('acha pela sigla', () => expect(combina(ITA, 'ITA')).toBe(true))
  it('acha em caixa baixa', () => expect(combina(ITA, 'ita')).toBe(true))
  it('acha por apelido longo', () => expect(combina(ITA, 'Tecnológico de Aeronáutica')).toBe(true))
  it('acha por trecho do nome canonico sem acento', () =>
    expect(combina(ITA, 'aeronautica')).toBe(true))
  it('nao acha o que nao e', () => expect(combina(ITA, 'UFMG')).toBe(false))
})

describe('ordenarPorRelevancia', () => {
  it('apelido exato vem antes de trecho do nome', () => {
    const ordenada = ordenarPorRelevancia([UFMG, ITA], 'ita')
    expect(ordenada[0].id).toBe(1)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run testes/lib/instituicoes.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/lib/instituicoes.js`:

```js
export function normalizar(texto) {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function termosDe(instituicao) {
  return [instituicao.nome_canonico, ...(instituicao.apelidos ?? [])].map(normalizar)
}

export function combina(instituicao, termo) {
  const alvo = normalizar(termo)
  if (!alvo) return true
  return termosDe(instituicao).some((t) => t.includes(alvo))
}

export function ordenarPorRelevancia(lista, termo) {
  const alvo = normalizar(termo)
  const peso = (instituicao) => {
    const termos = termosDe(instituicao)
    if (termos.some((t) => t === alvo)) return 0
    if (termos.some((t) => t.startsWith(alvo))) return 1
    return 2
  }
  return [...lista].sort(
    (a, b) => peso(a) - peso(b) || a.nome_canonico.localeCompare(b.nome_canonico, 'pt-BR'))
}
```

- [ ] **Step 4: Rodar**

Run: `npx vitest run testes/lib/instituicoes.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(lib): normalizacao e busca de instituicao por apelido"
```

---

### Task 16: Compressão de imagem mirando o carrossel

**Files:**
- Create: `src/lib/imagem.js`, `testes/lib/imagem.test.js`

**Interfaces:**
- Produces: `calcularDimensao({ largura, altura }, larguraMaxima) → { largura, altura }`, `LARGURA_MAXIMA = 1280`, `QUALIDADE = 0.85`

- [ ] **Step 1: Escrever o teste**

A parte que decide é pura; o `canvas` não se testa.

`testes/lib/imagem.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { calcularDimensao, LARGURA_MAXIMA } from '../../src/lib/imagem.js'

describe('calcularDimensao', () => {
  it('nao amplia imagem menor que o limite', () => {
    expect(calcularDimensao({ largura: 800, altura: 600 })).toEqual({ largura: 800, altura: 600 })
  })

  it('reduz mantendo proporcao', () => {
    expect(calcularDimensao({ largura: 2560, altura: 1440 }))
      .toEqual({ largura: 1280, altura: 720 })
  })

  it('arredonda a altura para inteiro', () => {
    const r = calcularDimensao({ largura: 1920, altura: 1081 })
    expect(Number.isInteger(r.altura)).toBe(true)
  })

  it('o limite e 1280, acima dos 1080 do carrossel', () => {
    expect(LARGURA_MAXIMA).toBe(1280)
  })

  it('print retrato alto reduz pela largura, nao pela altura', () => {
    expect(calcularDimensao({ largura: 1440, altura: 3200 }).largura).toBe(1280)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run testes/lib/imagem.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/lib/imagem.js`:

```js
// O post do Instagram tem 1080px de largura. Comprimir abaixo disso
// degradaria o texto do print, que e justamente o que o leitor precisa ler.
export const LARGURA_MAXIMA = 1280
export const QUALIDADE = 0.85

export function calcularDimensao({ largura, altura }, larguraMaxima = LARGURA_MAXIMA) {
  if (largura <= larguraMaxima) return { largura, altura }
  const escala = larguraMaxima / largura
  return { largura: larguraMaxima, altura: Math.round(altura * escala) }
}

// Impuro: recebe File, devolve Blob WebP. Nao tem teste unitario —
// a decisao que importa esta em calcularDimensao, que tem.
export async function comprimir(arquivo) {
  const bitmap = await createImageBitmap(arquivo)
  const { largura, altura } = calcularDimensao(
    { largura: bitmap.width, altura: bitmap.height })
  const tela = document.createElement('canvas')
  tela.width = largura
  tela.height = altura
  tela.getContext('2d').drawImage(bitmap, 0, 0, largura, altura)
  return new Promise((resolver) =>
    tela.toBlob(resolver, 'image/webp', QUALIDADE))
}
```

- [ ] **Step 4: Rodar**

Run: `npx vitest run testes/lib/imagem.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(lib): compressao de imagem mirando o carrossel"
```

---

### Task 17: Tela de cadastros de referência, com mesclagem de instituições

> **Emenda pós-aprovação (2026-09-24).** Os buckets (Task 10) não ganharam política de UPDATE — decisão do dono. Trocar a logo de uma instituição não é um `upload({ upsert: true })` sobre o nome antigo: com `upsert: true`, o Storage cai no caminho de UPDATE quando o nome já existe, e sem política de UPDATE a chamada é negada. `enviarLogo` abaixo muda para `upsert: false`. Nome de arquivo único por envio, regra usada por todo chamador de `enviarLogo`/`enviarPrint` neste plano (Tasks 17, 19, 20): nomeArquivo = `` `${crypto.randomUUID()}.webp` `` (`crypto.randomUUID()` disponível em navegadores em `https`/`localhost`). A troca por uma logo nova vira **enviar o arquivo novo com nome novo, gravar a referência (`logo_path`) na tabela, e só depois de esse salvamento confirmar, apagar o arquivo antigo** com `storage.from('logos').remove([antigoLogoPath])` — nessa ordem, nunca ao contrário, para não deixar `logo_path` apontando para um arquivo já apagado. Se o salvamento falhar, quem chama apaga o arquivo **novo** recém-enviado (não o antigo) — sem isso, um envio bem-sucedido seguido de falha ao salvar deixa lixo órfão no bucket. Step 5 (`FormInstituicao.vue`) abaixo foi reescrito para descrever essa sequência.
>
> **Segunda emenda (2026-09-24), mesma data.** Convenção da emenda da Task 11: fixture de
> tabela com nome único é sempre upsert idempotente. No Step 1 abaixo, `instituicao
> 'Universidade Federal de Juiz de Fora'`, `instituicao 'UFJF'` e `prova 'ENEM'` viram
> upsert em `(nome_canonico)`/`(nome)`. Conferido o caso que o teste de mesclagem apaga a
> instituição perdedora: numa segunda execução, o upsert do vencedor resolve para a mesma
> linha de sempre; o upsert do "perdedor" não encontra `nome_canonico = 'UFJF'` (a linha
> anterior foi apagada pela mesclagem) e insere uma linha nova, sem conflito. Dentro da
> função, `insert into instituicao_apelido (...) on conflict (apelido) do nothing` (Step 3)
> já é idempotente: o apelido `'UFJF'` migrado na execução anterior permanece apontando
> para o vencedor e a segunda inserção é ignorada sem erro. Nenhuma restauração adicional
> de estado é necessária além dos dois upserts de instituição e do upsert da prova.

> **Emenda pós-aprovação (2026-09-24).** Unidade M3-G: a `0011` agora é
> `0011_privilegios.sql` (privilégios explícitos, paridade com o hospedado, que não expõe
> tabelas novas automaticamente). A migração desta tarefa passa a ser
> **`supabase/migrations/0012_mesclar.sql`** (nomes trocados abaixo) e termina com
> `revoke all on function public.mesclar_instituicoes(bigint, bigint) from public, anon, service_role;` e
> `grant execute on function public.mesclar_instituicoes(bigint, bigint) to authenticated;`.
> O `grant` é o que importa: sem ele o app recebe "permission denied" no hospedado e no
> local. O `revoke ... from public, anon, service_role` é redundante hoje — a `0011` já tirou
> o `EXECUTE` padrão de `PUBLIC` para funções que `postgres` criar daqui em diante (revoke
> global de default privileges) e os defaults de `postgres` em `public` não concedem nada aos
> papéis da API —, mas fica para a migração não depender de onde e por quem ela roda: se a
> função for criada por outro papel, ou antes de o padrão valer, `PUBLIC` ganharia `EXECUTE`
> pelo padrão embutido e `anon`/`service_role` poderiam ganhar um grant explícito pelo default
> ACL de outro papel (o local tem um de `supabase_admin` em `public` que concede tudo).
> Revogar só de `PUBLIC` deixaria esse grant explícito de pé. Os testes de catálogo de `testes/rls/privilegios.test.js` passam
> a exigir isso: acrescentar `'mesclar_instituicoes(p_vencedor bigint, p_perdedor bigint)'` a
> `FUNCOES_DO_APP` (em ordem alfabética); sem o `grant`, "só as funções do app têm EXECUTE
> para authenticated" reprova.

**Files:**
- Create: `src/dados/referencia.js`, `src/telas/Cadastros.vue`, `src/componentes/ListaInstituicoes.vue`, `src/componentes/FormInstituicao.vue`, `supabase/migrations/0012_mesclar.sql`, `testes/rls/mesclar.test.js`
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: `src/lib/instituicoes.js` (Task 15), `src/lib/imagem.js` (Task 16)
- Produces: `listarInstituicoes()`, `salvarInstituicao(dados)`, `mesclarInstituicoes(idVencedor, idPerdedor)`, `listarSimples(tabela)`, `criarSimples(tabela, nome)`

- [ ] **Step 1: Escrever o teste da mesclagem**

Mesclar não é enfeite: permitir criar instituição na hora garante duplicata na primeira semana.

`testes/rls/mesclar.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { conectar } from './ajuda.js'

describe('mesclar_instituicoes', () => {
  it('transforma o perdedor em apelido do vencedor e migra os resultados', async () => {
    const c = await conectar()
    const vencedor = (await c.query(
      `insert into instituicao (nome_canonico) values
       ('Universidade Federal de Juiz de Fora')
       on conflict (nome_canonico) do update set nome_canonico = excluded.nome_canonico
       returning id`)).rows[0].id
    const perdedor = (await c.query(
      `insert into instituicao (nome_canonico) values ('UFJF')
       on conflict (nome_canonico) do update set nome_canonico = excluded.nome_canonico
       returning id`)).rows[0].id

    const dep = (await c.query(
      `insert into depoimento (texto_completo, fonte)
       values ('t','MANUAL') returning id`)).rows[0].id
    const prova = (await c.query(
      `insert into prova (nome) values ('ENEM')
       on conflict (nome) do update set nome = excluded.nome
       returning id`)).rows[0].id
    const part = (await c.query(
      `insert into participacao (depoimento_id, prova_id, ano)
       values ($1,$2,2025) returning id`, [dep, prova])).rows[0].id
    await c.query(
      `insert into resultado (participacao_id, instituicao_id, situacao)
       values ($1,$2,'APROVADO')`, [part, perdedor])

    await c.query('select mesclar_instituicoes($1, $2)', [vencedor, perdedor])

    const restou = await c.query(
      'select count(*)::int as n from instituicao where id = $1', [perdedor])
    expect(restou.rows[0].n).toBe(0)

    const apelido = await c.query(
      'select apelido from instituicao_apelido where instituicao_id = $1', [vencedor])
    expect(apelido.rows.map((r) => r.apelido)).toContain('UFJF')

    const migrado = await c.query(
      'select instituicao_id from resultado where participacao_id = $1', [part])
    expect(Number(migrado.rows[0].instituicao_id)).toBe(Number(vencedor))

    await c.end()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run testes/rls/mesclar.test.js`
Expected: FAIL — função não existe.

- [ ] **Step 3: Escrever a migração**

`supabase/migrations/0012_mesclar.sql`:

```sql
create or replace function public.mesclar_instituicoes(
  p_vencedor bigint, p_perdedor bigint)
returns void
language plpgsql
as $$
declare nome_perdedor text;
begin
  if p_vencedor = p_perdedor then
    raise exception 'nao da para mesclar uma instituicao com ela mesma';
  end if;

  select nome_canonico into nome_perdedor from instituicao where id = p_perdedor;
  if nome_perdedor is null then
    raise exception 'instituicao perdedora % nao existe', p_perdedor;
  end if;

  update resultado set instituicao_id = p_vencedor where instituicao_id = p_perdedor;
  update prova     set instituicao_id = p_vencedor where instituicao_id = p_perdedor;

  update instituicao_apelido set instituicao_id = p_vencedor
   where instituicao_id = p_perdedor;

  insert into instituicao_apelido (instituicao_id, apelido)
  values (p_vencedor, nome_perdedor)
  on conflict (apelido) do nothing;

  delete from instituicao where id = p_perdedor;
end $$;

revoke all on function public.mesclar_instituicoes(bigint, bigint) from public, anon, service_role;
grant execute on function public.mesclar_instituicoes(bigint, bigint) to authenticated;
```

- [ ] **Step 4: Escrever a camada de dados**

`src/dados/referencia.js`:

```js
import { supabase } from './cliente.js'

export async function listarInstituicoes() {
  const { data, error } = await supabase
    .from('instituicao')
    .select('id, nome_canonico, logo_path, ativo, instituicao_apelido(apelido)')
    .order('nome_canonico')
  if (error) throw error
  return data.map((i) => ({
    ...i,
    apelidos: (i.instituicao_apelido ?? []).map((a) => a.apelido),
  }))
}

export async function salvarInstituicao({ id, nome_canonico, logo_path, apelidos }) {
  const { data, error } = await supabase
    .from('instituicao')
    .upsert({ id, nome_canonico, logo_path })
    .select('id')
    .single()
  if (error) throw error

  await supabase.from('instituicao_apelido').delete().eq('instituicao_id', data.id)
  if (apelidos?.length) {
    const { error: erroApelido } = await supabase
      .from('instituicao_apelido')
      .insert(apelidos.map((apelido) => ({ instituicao_id: data.id, apelido })))
    if (erroApelido) throw erroApelido
  }
  return data.id
}

export async function mesclarInstituicoes(idVencedor, idPerdedor) {
  const { error } = await supabase.rpc('mesclar_instituicoes', {
    p_vencedor: idVencedor, p_perdedor: idPerdedor,
  })
  if (error) throw error
}

// upsert: false — o bucket nao tem politica de UPDATE (decisao do dono); um
// nome ja existente tem de ser negado, nunca sobrescrito. nomeArquivo precisa
// ser unico por envio (ver emenda no cabecalho desta tarefa); a substituicao
// de uma logo antiga e responsabilidade de quem chama (gravar a referencia
// nova antes de remover o arquivo antigo).
export async function enviarLogo(arquivo, nomeArquivo) {
  const { error } = await supabase.storage.from('logos').upload(nomeArquivo, arquivo, {
    upsert: false, contentType: 'image/webp',
  })
  if (error) throw error
  return supabase.storage.from('logos').getPublicUrl(nomeArquivo).data.publicUrl
}

export async function listarSimples(tabela) {
  const { data, error } = await supabase.from(tabela).select('id, nome').order('nome')
  if (error) throw error
  return data
}

export async function criarSimples(tabela, nome) {
  const { data, error } = await supabase
    .from(tabela).insert({ nome }).select('id, nome').single()
  if (error) throw error
  return data
}
```

- [ ] **Step 5: Montar as telas**

`src/componentes/FormInstituicao.vue` — campos `nome_canonico`, lista de apelidos como chips com adicionar e remover, e envio de logo passando por `comprimir()` antes de `enviarLogo()`. Ao trocar a logo de uma instituição já existente: guardar o `logo_path` antigo; enviar o arquivo novo com nome único (`` `${crypto.randomUUID()}.webp` ``, ver emenda no cabeçalho desta tarefa) via `enviarLogo()`; gravar a instituição com o `logo_path` novo via `salvarInstituicao()`; só depois desse `salvarInstituicao()` ter sucesso, apagar o arquivo antigo com `storage.from('logos').remove([antigo])`. Se `salvarInstituicao()` falhar, apagar o arquivo **novo** que acabou de ser enviado (`remove([novo])`), não o antigo — a logo que já funcionava continua valendo.

`src/componentes/ListaInstituicoes.vue` — tabela com logo, nome, apelidos e botão **Mesclar**, que abre a escolha de vencedor e chama `mesclarInstituicoes`.

`src/telas/Cadastros.vue` — abas para Instituições, Provas, Cursos e Matérias, usando `listarSimples`/`criarSimples` nas três últimas. A aba de Provas tem o seletor opcional de instituição, que é nulo para o ENEM.

Ligar em `src/App.vue` no lugar do `<p>Autenticado.</p>`.

- [ ] **Step 6: Rodar tudo**

Run: `npx supabase db reset && npm test && npm run dev`
Expected: suíte passa; a tela cadastra instituição com logo e apelidos, e mescla duas.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: cadastros de referencia com mesclagem de instituicoes"
```

---

# Marco 4 — Ficha do depoimento

**Entrega ao fim do marco:** a equipe cadastra depoimentos completos à mão, com participações, notas, resultados, print e aluno.

---

### Task 18: Validação da ficha

> **Emenda pós-aprovação (Marco 2, 2026-09-24).** A revisão do Marco 2 pediu que
> `validarDepoimento` espelhe, para nota, as regras que o banco já aplica
> (`ck_nota_nao_negativa`, `ck_percentual_ate_100`, `ck_pontos_exige_maximo`,
> `ck_pontos_ate_maximo`, `ck_tri_faixa` — `supabase/migrations/0007_participacao.sql`), para a
> pessoa ver todas as causas de uma vez na ficha, em vez de um erro cru de constraint depois de
> salvar. **O banco continua a fonte da verdade — a validação da lib é conveniência, nunca
> substituição.** Acréscimos ao laço de notas do Step 3 abaixo:
>
> ```js
>     for (const nota of participacao.notas ?? []) {
>       if (!nota.materia_id) erros.push('Toda nota precisa de matéria.')
>       if (nota.valor_original == null) {
>         erros.push('Toda nota precisa de um valor.')
>       } else if (nota.valor_original < 0) {
>         erros.push('O valor da nota não pode ser negativo.')
>       }
>       if (nota.escala === 'PERCENTUAL' && nota.valor_original > 100) {
>         erros.push('Nota em percentual não pode passar de 100.')
>       }
>       if (nota.escala === 'PONTOS') {
>         if (!(nota.valor_maximo > 0)) {
>           erros.push('Nota em pontos precisa do valor máximo.')
>         } else if (nota.valor_original > nota.valor_maximo) {
>           erros.push('Nota em pontos não pode passar do valor máximo.')
>         }
>       }
>       if (nota.escala === 'TRI' && (nota.valor_original < 0 || nota.valor_original > 1000)) {
>         erros.push('Nota do TRI precisa estar entre 0 e 1000.')
>       }
>     }
> ```
>
> E os casos correspondentes, acrescentados ao Step 1 (`testes/lib/validacao.test.js`):
>
> ```js
>   it('nota sem valor e erro', () => {
>     const ficha = { ...BASE, participacoes: [{ prova_id: 1, ano: 2025,
>       notas: [{ materia_id: 1, escala: 'PERCENTUAL' }], resultados: [] }] }
>     expect(validarDepoimento(ficha)).toContain('Toda nota precisa de um valor.')
>   })
>
>   it('nota negativa e erro', () => {
>     const ficha = { ...BASE, participacoes: [{ prova_id: 1, ano: 2025,
>       notas: [{ materia_id: 1, valor_original: -1, escala: 'PERCENTUAL' }], resultados: [] }] }
>     expect(validarDepoimento(ficha)).toContain('O valor da nota não pode ser negativo.')
>   })
>
>   it('percentual acima de 100 e erro', () => {
>     const ficha = { ...BASE, participacoes: [{ prova_id: 1, ano: 2025,
>       notas: [{ materia_id: 1, valor_original: 101, escala: 'PERCENTUAL' }], resultados: [] }] }
>     expect(validarDepoimento(ficha)).toContain('Nota em percentual não pode passar de 100.')
>   })
>
>   it('pontos acima do maximo e erro', () => {
>     const ficha = { ...BASE, participacoes: [{ prova_id: 1, ano: 2025,
>       notas: [{ materia_id: 1, valor_original: 21, valor_maximo: 20, escala: 'PONTOS' }],
>       resultados: [] }] }
>     expect(validarDepoimento(ficha)).toContain('Nota em pontos não pode passar do valor máximo.')
>   })
>
>   it('tri fora da faixa 0-1000 e erro', () => {
>     const ficha = { ...BASE, participacoes: [{ prova_id: 1, ano: 2025,
>       notas: [{ materia_id: 1, valor_original: 1001, escala: 'TRI' }], resultados: [] }] }
>     expect(validarDepoimento(ficha)).toContain('Nota do TRI precisa estar entre 0 e 1000.')
>   })
> ```
>
> **Implementação (2026-09-24).** Além do laço de notas acima, a implementação real cobre mais
> dois pontos que a emenda original não detalhava. (1) Mirrors que faltavam: motivo de descarte
> ou observação de descarte presentes fora de `DESCARTADO` também são erro — o sentido inverso de
> `ck_descarte_motivo` e de `ck_descarte_observacao` (`0006_nucleo.sql`), senão reverter um
> descarte deixa motivo/observação órfãos apontando para um depoimento ativo sem a ficha acusar
> nada; `ck_ano` (1990–2100, `0007_participacao.sql`) veio como validação de faixa depois do check
> de presença; e `escala`/`situacao` viraram obrigatórios na ficha porque são `not null` no banco
> (nota e resultado). Observação em branco (só espaços) conta como vazia para a regra do `OUTRO`,
> mas uma observação não vazia num depoimento não descartado é erro. (2) Valores de formulário
> chegam como string (`'18'`, `' 20 '`, `''`), e comparar string teria bugs silenciosos (`'9' >
> '20'` é `true` em JS). Por isso `valor_original`, `valor_maximo`, `ano` e os ids usados em
> checagem de presença passam por um único helper de coerção numérica (`numero()`) antes de
> qualquer comparação; string vazia ou não numérica conta como ausente. `src/lib/validacao.js`
> (código real, com esses dois pontos) substitui o bloco de código deste Step 3 como referência.

**Files:**
- Create: `src/lib/validacao.js`, `testes/lib/validacao.test.js`

**Interfaces:**
- Produces: `validarDepoimento(ficha) → string[]`, `LIMITE_AVISO_RESUMO = 200`

- [ ] **Step 1: Escrever o teste**

`testes/lib/validacao.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { validarDepoimento, LIMITE_AVISO_RESUMO } from '../../src/lib/validacao.js'

const BASE = {
  texto_completo: 'Passei no ITA',
  fonte: 'MANUAL',
  autorizacao_publicacao: 'NAO_INFORMADO',
  status_uso: 'DISPONIVEL',
  participacoes: [],
}

describe('validarDepoimento', () => {
  it('ficha minima e valida', () => {
    expect(validarDepoimento(BASE)).toEqual([])
  })

  it('texto vazio e erro', () => {
    expect(validarDepoimento({ ...BASE, texto_completo: '  ' }))
      .toContain('O texto completo é obrigatório.')
  })

  it('PONTOS sem maximo e erro', () => {
    const ficha = { ...BASE, participacoes: [{ prova_id: 1, ano: 2025,
      notas: [{ materia_id: 1, valor_original: 18, escala: 'PONTOS' }], resultados: [] }] }
    expect(validarDepoimento(ficha))
      .toContain('Nota em pontos precisa do valor máximo.')
  })

  it('aprovado sem instituicao e erro', () => {
    const ficha = { ...BASE, participacoes: [{ prova_id: 1, ano: 2025, notas: [],
      resultados: [{ situacao: 'APROVADO', instituicao_id: null }] }] }
    expect(validarDepoimento(ficha))
      .toContain('Resultado aprovado precisa de instituição.')
  })

  it('NAO_AUTORIZADO fora de DESCARTADO e erro', () => {
    expect(validarDepoimento({ ...BASE, autorizacao_publicacao: 'NAO_AUTORIZADO' }))
      .toContain('Depoimento sem autorização só pode ficar descartado por falta de autorização.')
  })

  it('POSTADO sem data e erro', () => {
    expect(validarDepoimento({ ...BASE, status_uso: 'POSTADO' }))
      .toContain('Depoimento postado precisa da data da postagem.')
  })

  it('POSTADO sem link NAO e erro', () => {
    expect(validarDepoimento({ ...BASE, status_uso: 'POSTADO', data_postagem: '2026-09-01' }))
      .toEqual([])
  })

  it('resumo longo nao e erro — o aviso e visual', () => {
    const longo = 'a'.repeat(LIMITE_AVISO_RESUMO + 50)
    expect(validarDepoimento({ ...BASE, resumo_curto: longo })).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run testes/lib/validacao.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/lib/validacao.js`:

```js
// Aviso visual, nunca bloqueio: limite rigido produziria resumo truncado
// no meio da frase, que e pior que resumo longo.
export const LIMITE_AVISO_RESUMO = 200

export function validarDepoimento(ficha) {
  const erros = []

  if (!ficha.texto_completo?.trim()) {
    erros.push('O texto completo é obrigatório.')
  }
  if (!ficha.fonte) {
    erros.push('A fonte é obrigatória.')
  }
  if (ficha.autorizacao_publicacao === 'NAO_AUTORIZADO'
      && !(ficha.status_uso === 'DESCARTADO'
           && ficha.motivo_descarte === 'SEM_AUTORIZACAO')) {
    erros.push(
      'Depoimento sem autorização só pode ficar descartado por falta de autorização.')
  }
  if (ficha.status_uso === 'DESCARTADO' && !ficha.motivo_descarte) {
    erros.push('Depoimento descartado precisa de motivo.')
  }
  if (ficha.motivo_descarte === 'OUTRO' && !ficha.observacao_descarte?.trim()) {
    erros.push('Motivo "outro" precisa de observação.')
  }
  if (ficha.status_uso === 'POSTADO' && !ficha.data_postagem) {
    erros.push('Depoimento postado precisa da data da postagem.')
  }

  for (const participacao of ficha.participacoes ?? []) {
    if (!participacao.prova_id) erros.push('Toda participação precisa de prova.')
    if (!participacao.ano) erros.push('Toda participação precisa de ano.')

    for (const nota of participacao.notas ?? []) {
      if (!nota.materia_id) erros.push('Toda nota precisa de matéria.')
      if (nota.escala === 'PONTOS' && !(nota.valor_maximo > 0)) {
        erros.push('Nota em pontos precisa do valor máximo.')
      }
    }
    for (const resultado of participacao.resultados ?? []) {
      if (resultado.situacao === 'APROVADO' && !resultado.instituicao_id) {
        erros.push('Resultado aprovado precisa de instituição.')
      }
    }
  }

  return [...new Set(erros)]
}
```

- [ ] **Step 4: Rodar**

Run: `npx vitest run testes/lib/validacao.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(lib): validacao da ficha do depoimento"
```

---

### Task 19: Gravação do depoimento inteiro

> **Emenda pós-aprovação (2026-09-24).** Mesma decisão da emenda da Task 17: o bucket `prints` também não tem política de UPDATE, então `enviarPrint` abaixo muda para `upsert: false`, com o mesmo nome de arquivo único descrito na emenda da Task 17 (`` `${crypto.randomUUID()}.webp` ``). A orquestração da troca (enviar o novo → salvar a referência → só então apagar o antigo; se salvar falhar, apagar o novo em vez do antigo) fica a cargo de quem chama `enviarPrint` — ver a emenda da Task 20, onde essa chamada é combinada com `salvarDepoimento` na tela da ficha.
>
> **Segunda emenda (2026-09-24), mesma data.** Convenção da emenda da Task 11: fixture de
> tabela com nome único é sempre upsert idempotente. No Step 1 abaixo, `prova 'ENEM'`,
> `materia 'Fisica'`, `instituicao 'UFMG'` (primeiro teste) e `prova 'Fuvest'` (segundo
> teste) viram upsert em `(nome)`/`(nome_canonico)`.

> **Terceira emenda (Marco 2, 2026-09-24).** Revisão do Marco 2 encontrou três problemas no
> Step 1 (teste) e no Step 3 (SQL) abaixo:
> 1. **`count(*) from depoimento` global é instável com arquivos rodando em paralelo**
>    (`vite.config.js` roda os arquivos de teste em paralelo — mesmo problema que a emenda da
>    Task 8/11/17/19 já resolveu em outros lugares com fixture de marcador único). O teste "nada é
>    gravado se uma parte viola regra" no Step 1 abaixo compara `antes`/`depois` do total da
>    tabela inteira: outro arquivo inserindo um depoimento entre as duas contagens derruba o teste
>    por um motivo que não é o que ele afirma testar. Trocado por contar só as linhas cujo
>    `texto_completo` contém o marcador do próprio teste — nenhuma linha deveria bater antes (o
>    marcador é novo) nem depois (a transação foi desfeita), então a contagem certa nos dois casos
>    é sempre `0`, sem precisar do "antes":
>    ```js
>      it('nada e gravado se uma parte viola regra', async () => {
>        const MARCADOR = 'MARCADORSALVARROLLBACK'
>        const c = await conectar()
>        const prova = (await c.query(
>          `insert into prova (nome) values ('Fuvest')
>           on conflict (nome) do update set nome = excluded.nome
>           returning id`)).rows[0].id
>        await c.end()
>
>        await expect(salvar({
>          texto_completo: `Texto valido ${MARCADOR}`,
>          fonte: 'MANUAL',
>          participacoes: [{ prova_id: prova, ano: 2025, notas: [],
>            resultados: [{ situacao: 'APROVADO', instituicao_id: null }] }],
>        })).rejects.toThrow()
>
>        const c2 = await conectar()
>        const depois = Number((await c2.query(
>          `select count(*)::int n from depoimento where texto_completo like $1`,
>          [`%${MARCADOR}%`])).rows[0].n)
>        await c2.end()
>        expect(depois).toBe(0)
>      })
>    ```
> 2. **`salvar_depoimento` não tem `set search_path = ''` nem tabelas qualificadas por
>    `public.`**, inconsistente com a convenção registrada na emenda da Task 11
>    (`eh_membro_equipe()`, `tocar_atualizado_em()`, `buscar_depoimentos()`). Corrigido no Step 3.
> 3. **`atualizado_em = now()` no `update` do Step 3 disputa com o trigger** `trg_tocar_atualizado_em`
>    (Task 6, `supabase/migrations/0006_nucleo.sql`), que já toca `atualizado_em` em todo `UPDATE`
>    de `depoimento` — a linha é redundante e, se algum dia o trigger mudar de critério (ex.: só
>    tocar quando um campo específico muda), as duas fontes divergem em silêncio. Removida; o
>    trigger é a única fonte. Pelo mesmo motivo, **`print_path`, `link_original` e `link_post`
>    passam a gravar com `nullif(btrim(p_ficha->>'campo'), '')`** — sem isso, uma ficha que manda
>    string vazia (campo limpo no formulário, não omitido) grava `''` em vez de `null`, e
>    `d.print_path is not null` (filtro `tem_print` de `buscar_depoimentos`, Task 11) contaria
>    "tem print" para um depoimento sem print de verdade.
>
> Trecho corrigido do Step 3 (cabeçalho e as três colunas afetadas — o resto do corpo da função
> não muda):
> ```sql
> create or replace function public.salvar_depoimento(p_ficha jsonb)
> returns bigint
> language plpgsql
> set search_path = ''
> as $$
> declare
>   v_id   bigint := (p_ficha->>'id')::bigint;
>   v_part jsonb;
>   v_pid  bigint;
>   v_item jsonb;
> begin
>   if v_id is null then
>     insert into public.depoimento (
>       texto_completo, resumo_curto, autor_bruto, autor_contato_bruto, fonte,
>       link_original, data_depoimento, print_path, aluno_id,
>       autorizacao_publicacao, status_uso, data_postagem, link_post,
>       motivo_descarte, observacao_descarte)
>     values (
>       p_ficha->>'texto_completo', p_ficha->>'resumo_curto',
>       p_ficha->>'autor_bruto', p_ficha->>'autor_contato_bruto',
>       (p_ficha->>'fonte')::fonte_depoimento,
>       nullif(btrim(p_ficha->>'link_original'), ''), (p_ficha->>'data_depoimento')::date,
>       nullif(btrim(p_ficha->>'print_path'), ''), (p_ficha->>'aluno_id')::bigint,
>       coalesce((p_ficha->>'autorizacao_publicacao')::autorizacao_publicacao,
>                'NAO_INFORMADO'),
>       coalesce((p_ficha->>'status_uso')::status_uso, 'DISPONIVEL'),
>       (p_ficha->>'data_postagem')::date, nullif(btrim(p_ficha->>'link_post'), ''),
>       (p_ficha->>'motivo_descarte')::motivo_descarte,
>       p_ficha->>'observacao_descarte')
>     returning id into v_id;
>   else
>     update public.depoimento set
>       texto_completo = p_ficha->>'texto_completo',
>       resumo_curto = p_ficha->>'resumo_curto',
>       autor_bruto = p_ficha->>'autor_bruto',
>       autor_contato_bruto = p_ficha->>'autor_contato_bruto',
>       fonte = (p_ficha->>'fonte')::fonte_depoimento,
>       link_original = nullif(btrim(p_ficha->>'link_original'), ''),
>       data_depoimento = (p_ficha->>'data_depoimento')::date,
>       print_path = nullif(btrim(p_ficha->>'print_path'), ''),
>       aluno_id = (p_ficha->>'aluno_id')::bigint,
>       autorizacao_publicacao = (p_ficha->>'autorizacao_publicacao')::autorizacao_publicacao,
>       status_uso = (p_ficha->>'status_uso')::status_uso,
>       data_postagem = (p_ficha->>'data_postagem')::date,
>       link_post = nullif(btrim(p_ficha->>'link_post'), ''),
>       motivo_descarte = (p_ficha->>'motivo_descarte')::motivo_descarte,
>       observacao_descarte = p_ficha->>'observacao_descarte'
>     where id = v_id;
>   end if;
>
>   delete from public.depoimento_tipo  where depoimento_id = v_id;
>   delete from public.depoimento_canal where depoimento_id = v_id;
>   delete from public.participacao     where depoimento_id = v_id;
>
>   for v_item in select * from jsonb_array_elements(coalesce(p_ficha->'tipos','[]'))
>   loop
>     insert into public.depoimento_tipo (depoimento_id, tipo)
>     values (v_id, (v_item #>> '{}')::tipo_depoimento);
>   end loop;
>
>   for v_item in select * from jsonb_array_elements(coalesce(p_ficha->'canais','[]'))
>   loop
>     insert into public.depoimento_canal (depoimento_id, canal)
>     values (v_id, (v_item #>> '{}')::canal_un);
>   end loop;
>
>   for v_part in select * from jsonb_array_elements(coalesce(p_ficha->'participacoes','[]'))
>   loop
>     insert into public.participacao (depoimento_id, prova_id, ano)
>     values (v_id, (v_part->>'prova_id')::bigint, (v_part->>'ano')::smallint)
>     returning id into v_pid;
>
>     for v_item in select * from jsonb_array_elements(coalesce(v_part->'notas','[]'))
>     loop
>       insert into public.nota (participacao_id, materia_id, valor_original, escala, valor_maximo)
>       values (v_pid, (v_item->>'materia_id')::bigint,
>               (v_item->>'valor_original')::numeric,
>               (v_item->>'escala')::escala_nota,
>               (v_item->>'valor_maximo')::numeric);
>     end loop;
>
>     for v_item in select * from jsonb_array_elements(coalesce(v_part->'resultados','[]'))
>     loop
>       insert into public.resultado (participacao_id, instituicao_id, curso_id, situacao)
>       values (v_pid, (v_item->>'instituicao_id')::bigint,
>               (v_item->>'curso_id')::bigint,
>               (v_item->>'situacao')::situacao_resultado);
>     end loop;
>   end loop;
>
>   return v_id;
> end $$;
> ```
>
> **`atualizado_em` só avança em `UPDATE` direto de `depoimento`; editar tabela filha sem tocar o
> pai não o avança.** `salvar_depoimento` sempre atualiza o pai (o `update public.depoimento set
> ...` acima roda em todo salvamento de ficha existente, mesmo quando só os filhos mudaram de
> conteúdo), e qualquer caminho futuro que edite só filhos (ex.: uma função que só mexe em
> `nota`) deve fazer o mesmo, ou `atualizado_em` fica desatualizado em silêncio.

> **Quarta emenda (2026-09-24), fix round 1 da Task 18.** A revisão da Task 18 encontrou mais
> dois problemas que a nullif-em-branco da terceira emenda (acima) não cobria:
> 1. `observacao_descarte` também precisa gravar com `nullif(btrim(p_ficha->>'observacao_descarte'), '')`
>    — mesmo motivo do `print_path`/`link_original`/`link_post`: a ficha manda `''` para um
>    textarea limpo ou nunca preenchido, não `null`, e o validador da Task 18 trata texto em
>    branco (`''` ou só espaços) como "ausente" — contrato documentado em
>    `src/lib/validacao.js` — então quem converte esse branco para `NULL` de verdade é sempre a
>    camada de salvamento, nunca o validador (que bloquearia o usuário por um campo que ele nem
>    vê como preenchido). Mesma correção com `nullif(btrim(...), '')` vale para `resumo_curto`,
>    `autor_bruto` e `autor_contato_bruto`, pelo mesmo motivo.
> 2. `motivo_descarte` precisa gravar com `nullif(p_ficha->>'motivo_descarte', '')::public.motivo_descarte`
>    — um cast direto de `''::motivo_descarte` estoura com erro de enum inválido antes mesmo de
>    chegar em `ck_descarte_motivo`, então uma ficha com `motivo_descarte: ''` (select limpo, caso
>    normal de um depoimento ativo) quebraria com um erro técnico em vez de nenhum erro.
> 3. Todo cast de enum da função (`::fonte_depoimento`, `::autorizacao_publicacao`,
>    `::status_uso`, `::motivo_descarte`, `::tipo_depoimento`, `::canal_un`, `::escala_nota`,
>    `::situacao_resultado`) precisa ser qualificado por schema (`::public.fonte_depoimento`
>    etc.) — a função roda com `set search_path = ''` desde a terceira emenda, e um cast sem
>    qualificação falha em runtime com "type fonte_depoimento does not exist"; isto é um defeito
>    conhecido do SQL da terceira emenda acima, ainda não corrigido no texto do plano.
> 4. O teste do Step 1 (`testes/rls/salvar.test.js`) deve incluir o caso "observação em branco em
>    depoimento DISPONIVEL é gravada como NULL e aceita".

> **Emenda pós-aprovação (2026-09-24).** Unidade M3-G: a `0011` agora é
> `0011_privilegios.sql` e a da Task 17 é `0012_mesclar.sql`. A migração desta tarefa passa a
> ser **`supabase/migrations/0013_salvar_depoimento.sql`** (nomes trocados abaixo) e termina
> com `revoke all on function public.salvar_depoimento(jsonb) from public, anon, service_role;` e
> `grant execute on function public.salvar_depoimento(jsonb) to authenticated;` — mesmo
> motivo da emenda M3-G da Task 17 (o `grant` é obrigatório; o `revoke` de `public, anon,
> service_role` é redundante após a `0011`, mas deixa a migração independente de quem a roda). Acrescentar
> `'salvar_depoimento(p_ficha jsonb)'` a `FUNCOES_DO_APP` em `testes/rls/privilegios.test.js`
> (em ordem alfabética). Nenhuma tabela nova: as tabelas que a função toca já têm
> `select, insert, update, delete` para `authenticated` desde a `0011`.

**Files:**
- Create: `src/dados/depoimentos.js`, `supabase/migrations/0013_salvar_depoimento.sql`, `testes/rls/salvar.test.js`

**Interfaces:**
- Consumes: `validarDepoimento` (Task 18)
- Produces: `salvarDepoimento(ficha) → id`, `carregarDepoimento(id) → ficha`

- [ ] **Step 1: Escrever o teste**

Gravar em cinco tabelas pelo cliente, uma chamada por vez, deixa lixo se a terceira falhar. Uma função no banco grava tudo numa transação só.

`testes/rls/salvar.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { conectar } from './ajuda.js'

async function salvar(ficha) {
  const c = await conectar()
  try {
    const { rows } = await c.query(
      'select salvar_depoimento($1::jsonb) as id', [JSON.stringify(ficha)])
    return Number(rows[0].id)
  } finally { await c.end() }
}

describe('salvar_depoimento', () => {
  it('grava depoimento com duas participacoes, nota e resultado', async () => {
    const c = await conectar()
    const prova = (await c.query(
      `insert into prova (nome) values ('ENEM')
       on conflict (nome) do update set nome = excluded.nome
       returning id`)).rows[0].id
    const materia = (await c.query(
      `insert into materia (nome) values ('Fisica')
       on conflict (nome) do update set nome = excluded.nome
       returning id`)).rows[0].id
    const inst = (await c.query(
      `insert into instituicao (nome_canonico) values ('UFMG')
       on conflict (nome_canonico) do update set nome_canonico = excluded.nome_canonico
       returning id`)).rows[0].id
    await c.end()

    const id = await salvar({
      texto_completo: 'Passei!',
      fonte: 'MANUAL',
      tipos: ['APROVACAO'],
      canais: ['SUPERIORES'],
      participacoes: [{
        prova_id: prova, ano: 2025,
        notas: [{ materia_id: materia, valor_original: 100, escala: 'PERCENTUAL' }],
        resultados: [{ instituicao_id: inst, situacao: 'APROVADO' }],
      }],
    })

    const c2 = await conectar()
    const n = await c2.query(
      `select (select count(*) from participacao where depoimento_id = $1) as p,
              (select count(*) from depoimento_tipo where depoimento_id = $1) as t,
              (select count(*) from depoimento_canal where depoimento_id = $1) as ca`, [id])
    await c2.end()
    expect(Number(n.rows[0].p)).toBe(1)
    expect(Number(n.rows[0].t)).toBe(1)
    expect(Number(n.rows[0].ca)).toBe(1)
  })

  it('nada e gravado se uma parte viola regra', async () => {
    const c = await conectar()
    const prova = (await c.query(
      `insert into prova (nome) values ('Fuvest')
       on conflict (nome) do update set nome = excluded.nome
       returning id`)).rows[0].id
    const antes = Number((await c.query('select count(*)::int n from depoimento')).rows[0].n)
    await c.end()

    await expect(salvar({
      texto_completo: 'Texto valido',
      fonte: 'MANUAL',
      participacoes: [{ prova_id: prova, ano: 2025, notas: [],
        resultados: [{ situacao: 'APROVADO', instituicao_id: null }] }],
    })).rejects.toThrow()

    const c2 = await conectar()
    const depois = Number((await c2.query('select count(*)::int n from depoimento')).rows[0].n)
    await c2.end()
    expect(depois).toBe(antes)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run testes/rls/salvar.test.js`
Expected: FAIL.

- [ ] **Step 3: Escrever a migração**

`supabase/migrations/0013_salvar_depoimento.sql`:

```sql
create or replace function public.salvar_depoimento(p_ficha jsonb)
returns bigint
language plpgsql
as $$
declare
  v_id   bigint := (p_ficha->>'id')::bigint;
  v_part jsonb;
  v_pid  bigint;
  v_item jsonb;
begin
  if v_id is null then
    insert into depoimento (
      texto_completo, resumo_curto, autor_bruto, autor_contato_bruto, fonte,
      link_original, data_depoimento, print_path, aluno_id,
      autorizacao_publicacao, status_uso, data_postagem, link_post,
      motivo_descarte, observacao_descarte)
    values (
      p_ficha->>'texto_completo', p_ficha->>'resumo_curto',
      p_ficha->>'autor_bruto', p_ficha->>'autor_contato_bruto',
      (p_ficha->>'fonte')::fonte_depoimento,
      p_ficha->>'link_original', (p_ficha->>'data_depoimento')::date,
      p_ficha->>'print_path', (p_ficha->>'aluno_id')::bigint,
      coalesce((p_ficha->>'autorizacao_publicacao')::autorizacao_publicacao,
               'NAO_INFORMADO'),
      coalesce((p_ficha->>'status_uso')::status_uso, 'DISPONIVEL'),
      (p_ficha->>'data_postagem')::date, p_ficha->>'link_post',
      (p_ficha->>'motivo_descarte')::motivo_descarte,
      p_ficha->>'observacao_descarte')
    returning id into v_id;
  else
    update depoimento set
      texto_completo = p_ficha->>'texto_completo',
      resumo_curto = p_ficha->>'resumo_curto',
      autor_bruto = p_ficha->>'autor_bruto',
      autor_contato_bruto = p_ficha->>'autor_contato_bruto',
      fonte = (p_ficha->>'fonte')::fonte_depoimento,
      link_original = p_ficha->>'link_original',
      data_depoimento = (p_ficha->>'data_depoimento')::date,
      print_path = p_ficha->>'print_path',
      aluno_id = (p_ficha->>'aluno_id')::bigint,
      autorizacao_publicacao = (p_ficha->>'autorizacao_publicacao')::autorizacao_publicacao,
      status_uso = (p_ficha->>'status_uso')::status_uso,
      data_postagem = (p_ficha->>'data_postagem')::date,
      link_post = p_ficha->>'link_post',
      motivo_descarte = (p_ficha->>'motivo_descarte')::motivo_descarte,
      observacao_descarte = p_ficha->>'observacao_descarte',
      atualizado_em = now()
    where id = v_id;
  end if;

  -- Substituicao total dos filhos: mais simples e mais seguro que
  -- reconciliar item a item, e o volume por depoimento e minusculo.
  delete from depoimento_tipo  where depoimento_id = v_id;
  delete from depoimento_canal where depoimento_id = v_id;
  delete from participacao     where depoimento_id = v_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_ficha->'tipos','[]'))
  loop
    insert into depoimento_tipo (depoimento_id, tipo)
    values (v_id, (v_item #>> '{}')::tipo_depoimento);
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_ficha->'canais','[]'))
  loop
    insert into depoimento_canal (depoimento_id, canal)
    values (v_id, (v_item #>> '{}')::canal_un);
  end loop;

  for v_part in select * from jsonb_array_elements(coalesce(p_ficha->'participacoes','[]'))
  loop
    insert into participacao (depoimento_id, prova_id, ano)
    values (v_id, (v_part->>'prova_id')::bigint, (v_part->>'ano')::smallint)
    returning id into v_pid;

    for v_item in select * from jsonb_array_elements(coalesce(v_part->'notas','[]'))
    loop
      insert into nota (participacao_id, materia_id, valor_original, escala, valor_maximo)
      values (v_pid, (v_item->>'materia_id')::bigint,
              (v_item->>'valor_original')::numeric,
              (v_item->>'escala')::escala_nota,
              (v_item->>'valor_maximo')::numeric);
    end loop;

    for v_item in select * from jsonb_array_elements(coalesce(v_part->'resultados','[]'))
    loop
      insert into resultado (participacao_id, instituicao_id, curso_id, situacao)
      values (v_pid, (v_item->>'instituicao_id')::bigint,
              (v_item->>'curso_id')::bigint,
              (v_item->>'situacao')::situacao_resultado);
    end loop;
  end loop;

  return v_id;
end $$;

revoke all on function public.salvar_depoimento(jsonb) from public, anon, service_role;
grant execute on function public.salvar_depoimento(jsonb) to authenticated;
```

- [ ] **Step 4: Escrever a camada de dados**

`src/dados/depoimentos.js`:

```js
import { supabase } from './cliente.js'
import { validarDepoimento } from '../lib/validacao.js'

export async function salvarDepoimento(ficha) {
  const erros = validarDepoimento(ficha)
  if (erros.length) throw new Error(erros.join('\n'))
  const { data, error } = await supabase.rpc('salvar_depoimento', { p_ficha: ficha })
  if (error) throw error
  return data
}

export async function carregarDepoimento(id) {
  const { data, error } = await supabase
    .from('depoimento')
    .select(`*, depoimento_tipo(tipo), depoimento_canal(canal),
             participacao(id, prova_id, ano,
               nota(id, materia_id, valor_original, escala, valor_maximo, percentual),
               resultado(id, instituicao_id, curso_id, situacao))`)
    .eq('id', id)
    .single()
  if (error) throw error
  return {
    ...data,
    tipos: (data.depoimento_tipo ?? []).map((t) => t.tipo),
    canais: (data.depoimento_canal ?? []).map((c) => c.canal),
    participacoes: (data.participacao ?? []).map((p) => ({
      ...p, notas: p.nota ?? [], resultados: p.resultado ?? [],
    })),
  }
}

export async function buscarDepoimentos(filtros) {
  const { data, error } = await supabase.rpc('buscar_depoimentos', { p_filtros: filtros })
  if (error) throw error
  return data
}

// upsert: false — mesmo motivo do enviarLogo (Task 17): sem politica de
// UPDATE no bucket, upsert: true cairia no caminho negado quando o nome ja
// existisse. nomeArquivo precisa ser unico por envio; a remocao do print
// antigo e responsabilidade de quem chama, depois de salvar a referencia nova.
export async function enviarPrint(arquivo, nomeArquivo) {
  const { error } = await supabase.storage.from('prints').upload(nomeArquivo, arquivo, {
    upsert: false, contentType: 'image/webp',
  })
  if (error) throw error
  return nomeArquivo
}

export async function urlAssinadaDoPrint(caminho, segundos = 3600) {
  const { data, error } = await supabase.storage
    .from('prints').createSignedUrl(caminho, segundos)
  if (error) throw error
  return data.signedUrl
}
```

- [ ] **Step 5: Rodar**

Run: `npx supabase db reset && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: gravacao transacional do depoimento inteiro"
```

---

### Task 20: Tela da ficha do depoimento

> **Emenda pós-aprovação (2026-09-24).** É aqui, não na Task 19, que `enviarPrint` e `salvarDepoimento` se combinam numa troca de arquivo de verdade (o bucket `prints` não tem política de UPDATE — ver emenda da Task 19). Ao trocar o print de um depoimento já existente: guardar o `print_path` antigo; enviar o print novo com nome único (`` `${crypto.randomUUID()}.webp` ``, regra da emenda da Task 17) via `enviarPrint()`; chamar `salvarDepoimento()` com o `print_path` novo; só depois desse `salvarDepoimento()` ter sucesso, apagar o print antigo com `storage.from('prints').remove([antigo])`. Se `salvarDepoimento()` falhar, apagar o print **novo** que acabou de ser enviado (`remove([novo])`), não o antigo — o print que já estava salvo continua valendo. Step 5 (`Ficha.vue`) abaixo foi reescrito para descrever essa sequência.

**Files:**
- Create: `src/telas/Ficha.vue`, `src/componentes/CamposDepoimento.vue`, `src/componentes/ListaParticipacoes.vue`, `src/componentes/CampoPrint.vue`, `src/componentes/SeletorAluno.vue`, `src/dados/alunos.js`
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: `salvarDepoimento`, `carregarDepoimento`, `enviarPrint` (Task 19); `comprimir` (Task 16); `LIMITE_AVISO_RESUMO` (Task 18)
- Produces: rota `#/ficha` e `#/ficha/:id`

- [ ] **Step 1: `CamposDepoimento.vue` — cabeçalho da ficha**

Campos: `texto_completo` (textarea), `resumo_curto` com contador, `fonte`, `link_original`, `data_depoimento`, `autorizacao_publicacao`, tipos (três caixas), canais (três caixas), status e os campos de descarte.

O contador do resumo:

```vue
<script setup>
import { computed } from 'vue'
import { LIMITE_AVISO_RESUMO } from '../lib/validacao.js'

const props = defineProps({ modelValue: Object })
const tamanho = computed(() => (props.modelValue.resumo_curto ?? '').length)
const longo = computed(() => tamanho.value > LIMITE_AVISO_RESUMO)
</script>

<template>
  <label>
    Resumo curto
    <textarea v-model="modelValue.resumo_curto" rows="3" />
    <small :class="{ aviso: longo }">
      {{ tamanho }} caracteres
      <template v-if="longo">
        — acima de {{ LIMITE_AVISO_RESUMO }} costuma ficar ilegível na página 1
        do carrossel. Você pode salvar assim mesmo.
      </template>
    </small>
  </label>
</template>
```

Mudar a autorização para `NAO_AUTORIZADO` muda status e motivo **na mesma operação**, senão o banco recusa:

```js
function aoMudarAutorizacao(valor) {
  ficha.autorizacao_publicacao = valor
  if (valor === 'NAO_AUTORIZADO') {
    ficha.status_uso = 'DESCARTADO'
    ficha.motivo_descarte = 'SEM_AUTORIZACAO'
  }
}
```

- [ ] **Step 2: `ListaParticipacoes.vue` — o aninhamento**

Cada participação tem prova, ano, lista de notas e lista de resultados, todas com adicionar e remover. Escolher a prova ENEM já traz a escala `TRI`; escolher `PERCENTUAL` esconde o campo de máximo.

```js
function aoEscolherProva(participacao, prova) {
  participacao.prova_id = prova.id
  for (const nota of participacao.notas) {
    if (!nota.escala) nota.escala = prova.nome === 'ENEM' ? 'TRI' : 'PERCENTUAL'
  }
}
```

Instituição, prova e curso usam um combobox que busca com `combina()` da Task 15 e oferece **criar na hora** quando nada bate, chamando `criarSimples`.

- [ ] **Step 3: `CampoPrint.vue` — colar, arrastar ou escolher**

Os prints nascem de captura de tela; colar elimina duas etapas.

```vue
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { comprimir } from '../lib/imagem.js'

const emit = defineEmits(['arquivo'])
const previa = ref(null)
const tamanhos = ref(null)

async function receber(arquivo) {
  if (!arquivo?.type?.startsWith('image/')) return
  const comprimido = await comprimir(arquivo)
  tamanhos.value = {
    antes: Math.round(arquivo.size / 1024),
    depois: Math.round(comprimido.size / 1024),
  }
  previa.value = URL.createObjectURL(comprimido)
  emit('arquivo', comprimido)
}

function aoColar(evento) {
  const item = [...evento.clipboardData.items].find((i) => i.type.startsWith('image/'))
  if (item) receber(item.getAsFile())
}

onMounted(() => window.addEventListener('paste', aoColar))
onUnmounted(() => window.removeEventListener('paste', aoColar))
</script>

<template>
  <div @drop.prevent="receber($event.dataTransfer.files[0])" @dragover.prevent>
    <p>Arraste o print, escolha um arquivo ou <strong>cole com Ctrl+V</strong>.</p>
    <input type="file" accept="image/*" @change="receber($event.target.files[0])" />
    <img v-if="previa" :src="previa" alt="Prévia do print" />
    <small v-if="tamanhos">{{ tamanhos.antes }} KB → {{ tamanhos.depois }} KB</small>
  </div>
</template>
```

- [ ] **Step 4: `SeletorAluno.vue` e `src/dados/alunos.js`**

`alunos.js` expõe `listarAlunos()`, `criarAluno(nome, perfis)` e `sugerirAluno(autorBruto, autorContatoBruto)`, que procura um `aluno_perfil` cujo `identificador` normalizado bata com o autor.

A sugestão **nunca liga sozinha.** Ela mostra "parece ser Fulano — ligar?" e espera o clique. Nomes se repetem.

- [ ] **Step 5: `Ficha.vue` — montar tudo e salvar**

Junta os componentes, chama `validarDepoimento` antes de gravar, exibe os erros numa lista e só então chama `salvarDepoimento`. Quando há print novo (colado/arrastado/escolhido em `CampoPrint.vue`) substituindo um print antigo (edição de um depoimento já existente): guardar o `print_path` antigo; enviar o novo com nome único (`` `${crypto.randomUUID()}.webp` ``, ver emenda no cabeçalho desta tarefa) via `enviarPrint()`; chamar `salvarDepoimento()` com o `print_path` novo; só depois desse `salvarDepoimento()` confirmar, apagar o print antigo com `storage.from('prints').remove([antigo])`. Se `salvarDepoimento()` falhar, apagar o print **novo** (`remove([novo])`), não o antigo.

- [ ] **Step 6: Verificar à mão**

Run: `npm run dev`
Expected: cadastrar o depoimento do ENEM com 100% em física e aprovação no ITA, em duas participações, com print colado por Ctrl+V. Reabrir e conferir que tudo voltou.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: ficha do depoimento com participacoes, notas, resultados e print"
```

---

# Marco 5 — Lista, filtros e abas

**Entrega ao fim do marco:** o critério de pronto da spec. A equipe encontra, em segundos, quem gabaritou física e passou no ITA.

---

### Task 21: Lista com filtros, abas e URL

**Files:**
- Create: `src/telas/Lista.vue`, `src/componentes/PainelFiltros.vue`, `src/componentes/LinhaDepoimento.vue`, `src/componentes/AbasFonte.vue`, `src/lib/rotas.js`, `testes/lib/rotas.test.js`
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: `montarFiltros`, `filtrosParaUrl`, `urlParaFiltros` (Task 12); `buscarDepoimentos` (Task 19)
- Produces: rota `#/depoimentos?...`

- [ ] **Step 1: Teste do roteador por hash**

O GitHub Pages não reescreve URL para aplicação de página única; com hash o problema não existe.

`testes/lib/rotas.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { lerRota, montarRota } from '../../src/lib/rotas.js'

describe('rotas por hash', () => {
  it('hash vazio cai na lista', () => {
    expect(lerRota('')).toEqual({ tela: 'depoimentos', id: null, consulta: '' })
  })

  it('le tela, id e consulta', () => {
    expect(lerRota('#/ficha/42?aba=GOOGLE_REVIEW'))
      .toEqual({ tela: 'ficha', id: 42, consulta: 'aba=GOOGLE_REVIEW' })
  })

  it('ida e volta', () => {
    const rota = { tela: 'depoimentos', id: null, consulta: 'ano=2025' }
    expect(lerRota(montarRota(rota))).toEqual(rota)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run testes/lib/rotas.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar `src/lib/rotas.js`**

```js
export function lerRota(hash) {
  const bruto = (hash ?? '').replace(/^#\/?/, '')
  const [caminho, consulta = ''] = bruto.split('?')
  const [tela, id] = caminho.split('/')
  return {
    tela: tela || 'depoimentos',
    id: id ? Number(id) : null,
    consulta,
  }
}

export function montarRota({ tela, id, consulta }) {
  const caminho = id != null ? `${tela}/${id}` : tela
  return `#/${caminho}${consulta ? '?' + consulta : ''}`
}
```

- [ ] **Step 4: `AbasFonte.vue`**

Quatro abas: Todos, Google, Forms, Manual. A aba define a fonte e troca as colunas em destaque; **os demais filtros sobrevivem à troca de aba**, porque a aba é recorte de exibição, não partição de dados.

A coluna de autorização aparece em destaque **só** na aba Forms — nas outras é sempre `NAO_INFORMADO` e viraria ruído.

- [ ] **Step 5: `PainelFiltros.vue`**

Todos os controles da spec. Dois cuidados:

- **Percentual e TRI são controles separados.** Cada condição de percentual é matéria + operador (`=100%`, `≥90%`, `≥70%`, livre); cada condição de TRI é matéria + pontuação mínima. Misturá-los produziria resultado errado em silêncio.
- **Ano** aceita ano exato ou faixa.

Toda mudança chama `filtrosParaUrl` e atualiza `location.hash`, para que a busca vire link salvável.

- [ ] **Step 6: `Lista.vue`**

Lê o hash, converte com `urlParaFiltros`, monta com `montarFiltros`, chama `buscarDepoimentos`, exibe a contagem e as linhas. Cada linha mostra resumo, autor, fonte, tipos, logos das instituições aprovadas, status e data. As logos vêm do bucket público, sem URL assinada.

- [ ] **Step 7: Verificar o critério de pronto**

Run: `npm run dev`
Expected: com o depoimento da Task 20 cadastrado, o filtro "100% em física" **e** "aprovado no ITA" o encontra, mesmo estando em participações diferentes. Copiar a URL, abrir em outra aba e ver os mesmos filtros aplicados.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: lista com filtros, abas por fonte e estado na URL"
```

---

# Marco 6 — Backup, resiliência e publicação

**Entrega ao fim do marco:** o sistema no ar, com backup diário provado por restauração e um alarme que dispara quando o backup para.

---

### Task 22 — MANUAL (Bernardo): destino do backup e Healthchecks

**Files:** nenhum.

**Interfaces:**
- Produces: Secrets `GDRIVE_*` e `HEALTHCHECKS_PING_URL`

- [ ] **Step 1: Descobrir se a UN tem Google Workspace**

Esta resposta decide a rota e não tem meio-termo. Abrir <https://admin.google.com> com o e-mail `@universonarrado.com`: se o painel administrativo abrir, há Workspace.

Resultado: ____________________

- [ ] **Step 2A: COM Workspace → Rota A, Drive compartilhado**

> **Por que esta é a preferencial:** num Drive compartilhado os arquivos pertencem ao *drive*, não a quem os cria. O backup deixa de depender da conta pessoal de uma pessoa — se você sair da empresa, ele continua.

1. No Google Drive, **Drives compartilhados → Novo** → `Backups UN Provas Sociais`
2. No Google Cloud, **IAM e administrador → Contas de serviço → Criar conta de serviço**
3. Criar uma chave JSON e baixá-la
4. Em **APIs e serviços → Biblioteca**, habilitar a **Google Drive API**
5. No Drive compartilhado, **Gerenciar membros** → adicionar o e-mail da conta de serviço como **Colaborador**
6. Criar a pasta `backups` dentro dele e copiar o id da URL
7. Secrets: `GDRIVE_SA_JSON` (conteúdo do JSON) e `GDRIVE_FOLDER_ID`

- [ ] **Step 2B: SEM Workspace → Rota B, OAuth com a sua conta**

> **Não tente compartilhar uma pasta do "Meu Drive" com a conta de serviço.** Conta de serviço não tem cota de armazenamento: a gravação falha com `storageQuotaExceeded`. O compartilhamento dá permissão, e permissão não é cota. Essa é a armadilha clássica desta integração.

1. Criar a pasta `Backups UN Provas Sociais` no seu Drive e copiar o id da URL
2. Reutilizar o OAuth client da Task 13, acrescentando o escopo `https://www.googleapis.com/auth/drive.file`
3. **Confirmar que o app está "Em produção".** Em "Modo de teste" o refresh token expira em **7 dias** e o backup pararia toda semana, sempre por um motivo que não aparece como erro de código
4. Gerar o refresh token pelo <https://developers.google.com/oauthplayground> (engrenagem → *Use your own OAuth credentials*)
5. Secrets: `GDRIVE_OAUTH_CLIENT` (`{"client_id":"…","client_secret":"…"}`), `GDRIVE_REFRESH_TOKEN` e `GDRIVE_FOLDER_ID`

- [ ] **Step 3: Criar o check no Healthchecks.io**

1. Conta gratuita em <https://healthchecks.io>
2. **Add Check** → nome `backup-un-provas-sociais`
3. **Period:** 1 day. **Grace time:** 6 hours
4. Confirmar que o e-mail de alerta é o seu
5. Copiar a **Ping URL** para o Secret `HEALTHCHECKS_PING_URL`

> A URL de ping é **segredo**: quem a tiver consegue silenciar o alarme pingando no lugar do job.

- [ ] **Step 4: Secrets restantes do backup**

| Secret | Onde achar |
|---|---|
| `SUPABASE_DB_URL` | Supabase → Settings → Database → Connection string (URI) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role |

---

### Task 23: Workflow de backup com dead man's switch

> **Emenda pós-aprovação (2026-09-24).** Unidade M3-G: desde a `0011_privilegios.sql`,
> `service_role` não tem privilégio nenhum em `public` (paridade com o hospedado, que não
> expõe tabelas novas). O ping anti-pausa original lia `membro_equipe` pela API REST com a
> service key: sob a `0011` o PostgREST responde "permission denied", o `curl -sf` falha, o
> job para antes do ping do Healthchecks e o dead man's switch dispara todo dia. Correção:
> 1. O ping lê uma tabela **sem dado pessoal**:
>    `curl -sf "$URL/rest/v1/curso?select=id&limit=1"` (Step 1 abaixo já corrigido).
> 2. Esta tarefa cria a própria migração, com o **próximo número livre na hora** (hoje seria
>    `0014`, depois de `0012_mesclar.sql` e `0013_salvar_depoimento.sql`; conferir em
>    `supabase/migrations/`), contendo só `grant select on public.curso to service_role;` —
>    nome sugerido `NNNN_ping_backup.sql`, com comentário dizendo que o grant existe para o
>    ping anti-pausa do `backup.yml`.
> 3. TDD: antes da migração, alterar `testes/rls/privilegios.test.js` para que a expectativa
>    de `service_role` seja **exatamente** `curso: SELECT` (e nada mais em tabela, sequência
>    ou função de `public`); ver o teste falhar; aplicar a migração; ver passar. `anon`
>    continua sem nada.
> 4. `pg_dump` (Step "Dump do banco") não é afetado: usa a URL do banco com o papel
>    `postgres`, não a Data API. `scripts/backup.mjs` usa a service key só na Storage API
>    (schema `storage`), que a `0011` não alterou.

**Files:**
- Create: `.github/workflows/backup.yml`, `scripts/backup.mjs`, `docs/runbook-backup.md`, `supabase/migrations/NNNN_ping_backup.sql` (próximo número livre)
- Modify: `testes/rls/privilegios.test.js` (expectativa de `service_role`)

**Interfaces:**
- Consumes: Secrets da Task 22
- Produces: backup diário no Drive e ping ao final

- [ ] **Step 1: Escrever o workflow**

`.github/workflows/backup.yml`:

```yaml
name: Backup diário

on:
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch:

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Dump do banco
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
        run: |
          sudo apt-get update && sudo apt-get install -y postgresql-client
          mkdir -p backups
          pg_dump "$SUPABASE_DB_URL" --no-owner --no-acl \
            -f "backups/banco-$(date +%F).sql"

      # O criterio de inatividade do Supabase nao esta documentado: a pagina
      # nao diz se conta conexao de banco, requisicao de API ou painel.
      # Por isso o job bate nas DUAS portas.
      - name: Ping anti-pausa pela API REST
        env:
          URL: ${{ secrets.VITE_SUPABASE_URL }}
          CHAVE: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: |
          curl -sf "$URL/rest/v1/curso?select=id&limit=1" \
            -H "apikey: $CHAVE" -H "Authorization: Bearer $CHAVE" > /dev/null

      - name: Arquivos dos buckets e envio ao Drive
        env:
          SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          GDRIVE_SA_JSON: ${{ secrets.GDRIVE_SA_JSON }}
          GDRIVE_OAUTH_CLIENT: ${{ secrets.GDRIVE_OAUTH_CLIENT }}
          GDRIVE_REFRESH_TOKEN: ${{ secrets.GDRIVE_REFRESH_TOKEN }}
          GDRIVE_FOLDER_ID: ${{ secrets.GDRIVE_FOLDER_ID }}
        run: |
          npm install googleapis @supabase/supabase-js
          node scripts/backup.mjs

      # ULTIMO passo, sempre. O ping so acontece se tudo acima deu certo:
      # e a AUSENCIA dele que dispara o alarme.
      - name: Ping do dead man's switch
        run: curl -sf "${{ secrets.HEALTHCHECKS_PING_URL }}"
```

- [ ] **Step 2: Escrever `scripts/backup.mjs`**

O script baixa os objetos novos de `prints` **e** de `logos` — as logos entram porque recadastrar cinquenta à mão custa uma tarde — envia tudo para o Drive e apaga o que passa de 30 diários e 12 mensais. Autentica pela Rota A se `GDRIVE_SA_JSON` existir, pela Rota B caso contrário:

```js
import { google } from 'googleapis'

function autenticar() {
  if (process.env.GDRIVE_SA_JSON) {
    return new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GDRIVE_SA_JSON),
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    })
  }
  const { client_id, client_secret } = JSON.parse(process.env.GDRIVE_OAUTH_CLIENT)
  const cliente = new google.auth.OAuth2(client_id, client_secret)
  cliente.setCredentials({ refresh_token: process.env.GDRIVE_REFRESH_TOKEN })
  return cliente
}
```

- [ ] **Step 3: Escrever `docs/runbook-backup.md`**

Conteúdo obrigatório:

1. **Qual rota está em uso** (A ou B) e por quê
2. **Resposta ao alerta do Healthchecks**, nesta ordem:
   1. Na aba **Actions** do repositório, verificar se o workflow agendado foi desativado por inatividade. Reativar pelo painel. *(O GitHub desativa workflows agendados em repositório público após 60 dias sem atividade.)*
   2. No painel do Supabase, verificar se o projeto pausou. Restaurar por lá — leva alguns minutos e não perde dados.
   3. Rodar `backup.yml` manualmente e confirmar que o ping chegou ao Healthchecks **antes** de encerrar o incidente.
3. **Procedimento de restauração** e a **data do último ensaio**
4. **Reforço não implementado:** disparo diário externo pelo cron-job.org chamando `workflow_dispatch`, com token de escopo mínimo. Fora do escopo porque o dead man's switch já cobre os três modos de falha, e porque a documentação do GitHub não esclarece se um workflow desativado ainda aceita `workflow_dispatch`

- [ ] **Step 4: Rodar à mão**

Disparar `backup.yml` pela aba Actions. Conferir que o arquivo chegou ao Drive e que o Healthchecks mostra o ping.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ops): backup diario com dead man's switch"
```

---

### Task 24 — MANUAL (Bernardo): ensaio de restauração e teste do alarme

**Files:** Modify `docs/runbook-backup.md`

Backup nunca restaurado é ficção, e vigia nunca disparado vale o mesmo. Os dois só existem depois de terem funcionado uma vez.

- [ ] **Step 1: Restaurar de verdade**

```bash
# Baixar o dump mais recente do Drive para ./backups/
npx supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f backups/banco-AAAA-MM-DD.sql
```

- [ ] **Step 2: Conferir os números**

```sql
select
  (select count(*) from depoimento)   as depoimentos,
  (select count(*) from participacao) as participacoes,
  (select count(*) from nota)         as notas,
  (select count(*) from resultado)    as resultados;
```

Comparar com o mesmo `SELECT` em produção. Divergência reprova o ensaio.

- [ ] **Step 3: Provocar o alarme**

Pausar o check no Healthchecks ou esperar o prazo vencer sem rodar o backup. Confirmar que o e-mail chega. Religar o check depois.

- [ ] **Step 4: Registrar e commitar**

Anotar as duas datas em `docs/runbook-backup.md`.

```bash
git add docs/runbook-backup.md
git commit -m "docs: registra ensaio de restauracao e teste do alarme"
```

---

### Task 25: Workflows de teste, deploy e migrações

**Files:**
- Create: `.github/workflows/testes.yml`, `.github/workflows/deploy.yml`, `.github/workflows/migracoes.yml`, `docs/runbook-equipe.md`

**Interfaces:**
- Consumes: Secrets da Task 13
- Produces: site publicado no GitHub Pages

- [ ] **Step 1: `testes.yml`**

```yaml
name: Testes

on: [push, pull_request]

jobs:
  testes:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npx supabase start
      - run: npm test
```

- [ ] **Step 2: `deploy.yml`**

```yaml
name: Publicar

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  publicar:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      # A anon key nao e segredo — ela aparece no bundle por design.
      # Injetar pelos Secrets mantem o REPOSITORIO limpo e evita que alguem
      # confunda as duas chaves e comite a de servico.
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deploy
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: `migracoes.yml` — só manual**

Deploy de front ruim se corrige com outro push. Migração ruim se corrige com backup, e é a única operação aqui sem desfazer barato.

```yaml
name: Aplicar migrações em produção

on:
  workflow_dispatch:

jobs:
  migrar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: npx supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      - run: npx supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
```

- [ ] **Step 4: Escrever `docs/runbook-equipe.md`**

```markdown
# Runbook — adicionar e remover membros da equipe

Não há tela de administração: para uma equipe deste tamanho, ela gastaria
esforço num problema que acontece duas vezes por ano, e uma conta comprometida
poderia usá-la para adicionar outra. Nenhum e-mail real aparece no repositório.

## Adicionar

1. Painel do Supabase → **SQL Editor**
2. Executar, trocando os valores:

       insert into membro_equipe (email, nome, ativo)
       values ('pessoa@universonarrado.com', 'Nome da Pessoa', true);

   O e-mail precisa estar em minúsculas — há um `CHECK` que exige isso.
3. Pedir que a pessoa entre com Google e confirme que a lista carrega.

## Remover

       update membro_equipe set ativo = false
        where email = 'pessoa@universonarrado.com';

**Desativar, nunca apagar.** O histórico de quem teve acesso tem valor, e
apagar a linha apagaria a rastreabilidade.

## Conferir quem tem acesso

       select email, nome, ativo, criado_em from membro_equipe order by nome;
```

- [ ] **Step 5: Habilitar o Pages**

Em **Settings → Pages → Source**, escolher **GitHub Actions**.

- [ ] **Step 6: Verificar**

Fazer push na `main`, esperar os dois workflows e abrir `https://<sua-conta>.github.io/un-provas-sociais/`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ops): workflows de teste, deploy e migracoes; runbook de equipe"
```

---

## Autorrevisão do plano

**Cobertura da spec**, seção a seção:

| Seção da spec | Tarefas |
|---|---|
| 3 — Escopo | Todas |
| 4 — Arquitetura (Vite, Vue, `src/lib`) | 1, 12, 15, 16, 18 |
| 5 — Modelo de dados | 5, 7, 8, 9 |
| 5 — Regras 1 a 7 | 7 (1, 4, 5, 6, 7), 8 (2, 3) |
| 5 — Transições | 9 |
| 5 — Canal | 5, 7, 12, 20 |
| 6 — Lista, filtros, abas, URL | 12, 21 |
| 6 — Semântica de depoimento | 11 (teste), 12 |
| 6 — Ficha, Ctrl+V, compressão, resumo | 16, 18, 20 |
| 6 — Cadastros e mesclagem | 17 |
| 6 — Alunos e sugestão | 20 |
| 7 — RLS, `eh_membro_equipe`, buckets | 6, 7, 8, 10 |
| 8 — Testes | 4, 6, 7, 8, 9, 10, 11, 12, 15, 16, 18 |
| 9 — Backup, anti-pausa, dead man's switch | 22, 23, 24 |
| 10 — Repositório e deploy | 1, 2, 25 |
| 12 — Ações manuais (8 itens) | 2, 3, 13, 22, 24 |

Sem lacunas.

**Nomes conferidos entre tarefas:** `eh_membro_equipe` (6→7, 8, 10, 17), `buscar_depoimentos` (11→19, 21), `salvar_depoimento` (19→20), `mesclar_instituicoes` (17), `montarFiltros`/`filtrosParaUrl`/`urlParaFiltros`/`ESTADO_VAZIO` (12→21), `calcularDimensao`/`comprimir` (16→17, 20), `combina`/`ordenarPorRelevancia` (15→17, 20), `validarDepoimento`/`LIMITE_AVISO_RESUMO` (18→19, 20), `lerRota`/`montarRota` (21).

**Ações manuais** aparecem como tarefas próprias (2, 3, 13, 22, 24), no marco em que se tornam necessárias, com instruções passo a passo.
