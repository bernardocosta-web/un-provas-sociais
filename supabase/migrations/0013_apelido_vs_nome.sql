-- Apelido nao pode ser o nome canonico de OUTRA instituicao, e nome canonico
-- nao pode ser apelido de outra (Task 17b, achado do teste manual do Marco 3:
-- o apelido "TESTE B" da instituicao T convivia com a instituicao "TESTE B",
-- e a busca por esse texto resolvia para duas instituicoes). Pela mesma
-- razao, tambem recusa apelido repetido em caixa diferente entre instituicoes
-- ("UFJF" x "ufjf": o UNIQUE de apelido e sensivel a caixa) e nome canonico
-- repetido em caixa diferente — cabem nas mesmas consultas.
--
-- Comparacao: lower(btrim(...)). Acento NAO e normalizado (sem unaccent).
-- Apelido igual ao nome da PROPRIA instituicao e permitido (redundante, mas
-- inofensivo); o mesmo vale para dois apelidos da mesma instituicao que so
-- diferem em caixa.
--
-- Por que constraint trigger DEFERRABLE INITIALLY DEFERRED (checagem no fim
-- da transacao) e nao CHECK/UNIQUE ou trigger comum: mesclar_instituicoes
-- (0012) insere o nome da perdedora como apelido da vencedora ANTES de apagar
-- a perdedora, na mesma transacao. Uma checagem imediata veria a perdedora
-- ainda viva e quebraria a mesclagem. No COMMIT ela ja foi apagada.
--
-- Como o evento e checado no fim, NEW pode estar velho (a linha foi editada
-- ou apagada depois). As funcoes releem a linha atual pelo id e ignoram
-- linha que nao existe mais.
--
-- SECURITY DEFINER (dono: o papel das migracoes, dono das tabelas, que nao
-- passa pela RLS): uma checagem de integridade tem de enxergar TODAS as
-- instituicoes e apelidos. Hoje a RLS de membro ve tudo e nao-membro nem
-- consegue inserir, entao SECURITY INVOKER funcionaria — mas deixaria a regra
-- dependente da RLS: se um dia alguma linha ficar invisivel para quem grava,
-- o conflito passaria calado. O risco do DEFINER aqui e nulo: funcao que
-- devolve trigger nao pode ser chamada diretamente (so como trigger), o
-- EXECUTE nao e concedido a nenhum papel da API, search_path vazio e tudo
-- qualificado por public. (convencao da Task 11).
--
-- Trava contra corrida: sob READ COMMITTED, as checagens sao SELECTs comuns
-- e duas transacoes que commitam juntas nao veem a linha uma da outra — a
-- instituicao "X" numa e o apelido "x" de outra instituicao na outra
-- passariam as duas. Por isso as duas funcoes comecam com
-- pg_advisory_xact_lock(1713001), UMA chave constante (1713001 = "Task 17b,
-- trava 1"; nenhuma outra parte do app usa advisory lock). A segunda
-- transacao espera a primeira terminar (a trava e solta no fim da
-- transacao) e, como cada comando do plpgsql tira um snapshot novo em READ
-- COMMITTED, a checagem dela ja enxerga a linha commitada pela primeira.
-- Serializa so os COMMITs que gravam nome/apelido de instituicao — volume
-- baixo, custo desprezivel. Teste: testes/rls/apelido_vs_nome_corrida.test.js.
--
-- Codigo de erro: P0001 explicito (o de `raise exception`), como as outras
-- excecoes proprias em pt-BR (mesclar_instituicoes). Nao 23505: esse
-- src/lib/erros.js traduz para uma mensagem generica; P0001 nao tem entrada
-- la de proposito, e a mensagem abaixo chega a tela (FormInstituicao) como
-- esta, citando o texto e a instituicao dona.

-- 1. Dados ja existentes violando a regra: falha com a lista, antes de criar
--    qualquer coisa (a migracao inteira desfaz). Corrigir os dados e rodar de
--    novo.
do $$
declare
  v_conflitos text;
begin
  select string_agg(conflito, '; ' order by conflito) into v_conflitos from (
    select format('apelido "%s" (de "%s") = nome da instituição "%s"',
                  ia.apelido, dono.nome_canonico, outra.nome_canonico) as conflito
      from public.instituicao_apelido ia
      join public.instituicao dono on dono.id = ia.instituicao_id
      join public.instituicao outra
        on lower(btrim(outra.nome_canonico)) = lower(btrim(ia.apelido))
       and outra.id <> ia.instituicao_id
    union all
    select format('apelido "%s" (de "%s") = apelido "%s" (de "%s")',
                  a.apelido, da.nome_canonico, b.apelido, db.nome_canonico)
      from public.instituicao_apelido a
      join public.instituicao_apelido b
        on lower(btrim(a.apelido)) = lower(btrim(b.apelido))
       and a.instituicao_id < b.instituicao_id
      join public.instituicao da on da.id = a.instituicao_id
      join public.instituicao db on db.id = b.instituicao_id
    union all
    select format('nome "%s" = nome "%s"', a.nome_canonico, b.nome_canonico)
      from public.instituicao a
      join public.instituicao b
        on lower(btrim(a.nome_canonico)) = lower(btrim(b.nome_canonico))
       and a.id < b.id
  ) x;

  if v_conflitos is not null then
    raise exception '0013_apelido_vs_nome: há dados violando a regra apelido x nome (corrija e rode de novo): %',
      v_conflitos;
  end if;
end $$;

-- 2. Checagem do lado do apelido (insert, troca de texto ou de instituicao).
create or replace function public.checar_apelido_vs_nome()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_apelido text;
  v_instituicao bigint;
  v_dono text;
begin
  perform pg_catalog.pg_advisory_xact_lock(1713001);  -- ver "Trava contra corrida" no topo

  select apelido, instituicao_id into v_apelido, v_instituicao
    from public.instituicao_apelido where id = new.id;
  if v_apelido is null then
    return null;
  end if;

  select nome_canonico into v_dono
    from public.instituicao
   where lower(btrim(nome_canonico)) = lower(btrim(v_apelido))
     and id <> v_instituicao
   limit 1;
  if v_dono is not null then
    raise exception 'o apelido "%" já é o nome de outra instituição: "%"', v_apelido, v_dono
      using errcode = 'P0001';
  end if;

  select i.nome_canonico into v_dono
    from public.instituicao_apelido ia
    join public.instituicao i on i.id = ia.instituicao_id
   where lower(btrim(ia.apelido)) = lower(btrim(v_apelido))
     and ia.instituicao_id <> v_instituicao
   limit 1;
  if v_dono is not null then
    raise exception 'o apelido "%" já é apelido de "%"', v_apelido, v_dono
      using errcode = 'P0001';
  end if;

  return null;
end $$;

-- 3. Checagem do lado do nome canonico (insert ou troca de nome).
create or replace function public.checar_nome_vs_apelido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome text;
  v_dono text;
begin
  perform pg_catalog.pg_advisory_xact_lock(1713001);  -- ver "Trava contra corrida" no topo

  select nome_canonico into v_nome from public.instituicao where id = new.id;
  if v_nome is null then
    return null;
  end if;

  select i.nome_canonico into v_dono
    from public.instituicao_apelido ia
    join public.instituicao i on i.id = ia.instituicao_id
   where lower(btrim(ia.apelido)) = lower(btrim(v_nome))
     and ia.instituicao_id <> new.id
   limit 1;
  if v_dono is not null then
    raise exception 'o nome "%" já é apelido de "%"', v_nome, v_dono
      using errcode = 'P0001';
  end if;

  select nome_canonico into v_dono
    from public.instituicao
   where lower(btrim(nome_canonico)) = lower(btrim(v_nome))
     and id <> new.id
   limit 1;
  if v_dono is not null then
    raise exception 'o nome "%" já é o nome de outra instituição: "%"', v_nome, v_dono
      using errcode = 'P0001';
  end if;

  return null;
end $$;

-- Funcao de trigger nao precisa de EXECUTE (0011): o trigger dispara sem
-- checar privilegio de quem grava. O padrao da 0011 ja nao concede nada;
-- o revoke explicito deixa isso visivel aqui.
revoke all on function public.checar_apelido_vs_nome() from public, anon, authenticated, service_role;
revoke all on function public.checar_nome_vs_apelido() from public, anon, authenticated, service_role;

create constraint trigger ck_apelido_vs_nome_apelido
  after insert or update of apelido, instituicao_id on public.instituicao_apelido
  deferrable initially deferred
  for each row execute function public.checar_apelido_vs_nome();

create constraint trigger ck_apelido_vs_nome_instituicao
  after insert or update of nome_canonico on public.instituicao
  deferrable initially deferred
  for each row execute function public.checar_nome_vs_apelido();
