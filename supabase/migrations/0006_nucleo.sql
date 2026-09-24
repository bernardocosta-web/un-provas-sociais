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

  -- Regra 4, parte da observacao: reverter um descarte tem de limpar
  -- tambem a observacao, senao ela sobrevive orfa num depoimento ativo.
  constraint ck_descarte_observacao
    check (status_uso = 'DESCARTADO' or observacao_descarte is null),

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
      'create policy %I on %I for all using ((select public.eh_membro_equipe()))
         with check ((select public.eh_membro_equipe()))',
      t || '_equipe', t);
  end loop;
end $$;

-- Generica: nao conhece a tabela que a usa, entao qualquer tabela futura
-- com uma coluna atualizado_em so precisa criar o trigger abaixo, sem
-- duplicar a funcao.
create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger trg_tocar_atualizado_em
  before update on depoimento
  for each row execute function public.tocar_atualizado_em();
