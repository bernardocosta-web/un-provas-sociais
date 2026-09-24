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
