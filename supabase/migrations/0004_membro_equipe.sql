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
--
-- eh_membro_equipe() dentro de um "select": recomendacao do advisor do
-- Supabase (lint auth_rls_initplan) para o Postgres avaliar a funcao uma vez
-- por consulta (InitPlan), nao uma vez por linha.
create policy membro_equipe_leitura on membro_equipe
  for select using ((select public.eh_membro_equipe()));
