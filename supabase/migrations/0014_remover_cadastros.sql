-- Remove cadastros de referencia (instituicao, prova, curso, materia) quando
-- SEM uso; recusa em pt-BR, dizendo onde esta em uso, quando EM uso. Pedido
-- do dono (Task 17c): dado cadastrado errado ou duplicado hoje so podia ser
-- editado ou (no caso de instituicao) mesclado — nunca apagado.
--
-- SECURITY INVOKER (padrao, sem a palavra-chave): roda com os privilegios e
-- a RLS de quem chama, como mesclar_instituicoes/salvar_instituicao (0012).
-- Nao-membro nao enxerga a linha (RLS de SELECT) nem apaga (RLS de DELETE) —
-- ambas usam a mesma politica (eh_membro_equipe()), entao a checagem inicial
-- (um SELECT simples) ja cobre os dois casos: id inexistente e id invisivel
-- pela RLS levam a mesma excecao "nao existe" (mesmo padrao da 0012, ver o
-- teste do estranho em remover_cadastros_estranho.test.js).
--
-- Checagem de uso e delete na MESMA funcao/transacao: atomico, nao depende
-- da ordem de chamadas do cliente. A FK "on delete restrict" (resultado,
-- participacao, nota) continua como rede de seguranca por baixo — se um dia
-- a contagem de uso divergir da FK, o delete falha com 23503 (mapeado em
-- pt-BR por src/lib/erros.js) em vez de apagar em silencio.
--
-- "on delete set null" TAMBEM conta como uso (prova.instituicao_id,
-- resultado.curso_id): apagar sem avisar mudaria prova/resultado existentes
-- por baixo — silencioso demais para um cadastro de referencia.
--
-- Trava contra corrida (fix round 1, achado da revisao): sob READ COMMITTED,
-- um INSERT que referencia o cadastro e comita ENTRE a contagem de uso e o
-- DELETE nao e visto pela contagem (cada SELECT tira um snapshot novo, mas o
-- da contagem ja passou) — para as FKs "set null" isso apagaria o cadastro e
-- desligaria silenciosamente a referencia nova, exatamente o que a regra do
-- dono proibe. O SELECT ... FOR UPDATE inicial (que ja fazia a checagem de
-- existencia) fecha essa janela: o Postgres tira um lock FOR KEY SHARE na
-- linha pai toda vez que uma linha filha com FK e inserida (nas duas colunas
-- de "on delete", nao so em restrict — comportamento do proprio verificador
-- de integridade referencial, nao algo que este codigo controla), e FOR
-- UPDATE conflita com FOR KEY SHARE. Uma insercao concorrente que comecou
-- ANTES do FOR UPDATE bloqueia este FOR UPDATE ate commitar/desfazer — e so
-- entao a contagem (que roda depois, com um SELECT novo) ja enxerga a linha
-- dela. Uma insercao que comeca DEPOIS do FOR UPDATE bloqueia ELA MESMA, ate
-- este delete terminar. Teste de duas conexoes:
-- testes/rls/remover_instituicao_corrida.test.js (so para instituicao/prova;
-- o mesmo lock protege curso/materia pelo mesmo mecanismo do Postgres, sem
-- teste separado).

-- instituicao: apelidos somem sozinhos (instituicao_apelido e "on delete
-- cascade", 0003). A logo NAO e apagada aqui — o Supabase nao deixa apagar
-- de storage.objects por SQL (so pela Storage API, ver storage.protect_delete
-- na Task 17); devolve o logo_path para quem chama remover o arquivo do
-- bucket "logos" DEPOIS de a remocao confirmar (removerInstituicao,
-- src/dados/referencia.js), igual mesclar_instituicoes faz com a perdedora.
create or replace function public.remover_instituicao(p_id bigint)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_nome text;
  v_logo text;
  v_resultados int;
  v_provas int;
  v_partes text[] := '{}';
begin
  select nome_canonico, logo_path into v_nome, v_logo
    from public.instituicao where id = p_id for update;
  if v_nome is null then
    raise exception 'instituição % não existe', p_id;
  end if;

  select count(*) into v_resultados from public.resultado where instituicao_id = p_id;
  select count(*) into v_provas     from public.prova     where instituicao_id = p_id;

  -- Cada parte so entra se a contagem for > 0 (revisao: "em uso em 0
  -- resultado(s) e 1 prova(s)" era ruido — o dono so quer ver o que existe).
  if v_resultados > 0 then
    v_partes := array_append(v_partes, format('%s resultado(s)', v_resultados));
  end if;
  if v_provas > 0 then
    v_partes := array_append(v_partes, format('%s prova(s)', v_provas));
  end if;

  if array_length(v_partes, 1) > 0 then
    raise exception '"%" está em uso em %. Para juntar com outra instituição, use Mesclar.',
      v_nome, array_to_string(v_partes, ' e ');
  end if;

  delete from public.instituicao where id = p_id;

  return v_logo;
end $$;

revoke all on function public.remover_instituicao(bigint) from public, anon, service_role;
grant execute on function public.remover_instituicao(bigint) to authenticated;

-- prova, curso e materia: mesma forma (trava, checa uso, apaga), uma funcao
-- so em vez de tres identicas. p_tabela e validado contra uma lista fechada
-- de tres valores literais (if/elsif) — nunca SQL dinamico com texto livre
-- (nada de EXECUTE format(%I, p_tabela)): um p_tabela que nao bater com
-- nenhum dos tres cai no "else" e e recusado.
create or replace function public.remover_cadastro_simples(p_tabela text, p_id bigint)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_nome text;
  v_uso int;
begin
  if p_tabela = 'prova' then
    select nome into v_nome from public.prova where id = p_id for update;
    if v_nome is null then
      raise exception 'prova % não existe', p_id;
    end if;

    select count(*) into v_uso from public.participacao where prova_id = p_id;
    if v_uso > 0 then
      raise exception 'A prova "%" está em uso em % participação(ões).', v_nome, v_uso;
    end if;

    delete from public.prova where id = p_id;

  elsif p_tabela = 'curso' then
    select nome into v_nome from public.curso where id = p_id for update;
    if v_nome is null then
      raise exception 'curso % não existe', p_id;
    end if;

    select count(*) into v_uso from public.resultado where curso_id = p_id;
    if v_uso > 0 then
      raise exception 'O curso "%" está em uso em % resultado(s).', v_nome, v_uso;
    end if;

    delete from public.curso where id = p_id;

  elsif p_tabela = 'materia' then
    select nome into v_nome from public.materia where id = p_id for update;
    if v_nome is null then
      raise exception 'matéria % não existe', p_id;
    end if;

    select count(*) into v_uso from public.nota where materia_id = p_id;
    if v_uso > 0 then
      raise exception 'A matéria "%" está em uso em % nota(s).', v_nome, v_uso;
    end if;

    delete from public.materia where id = p_id;

  else
    raise exception 'tabela "%" inválida', p_tabela;
  end if;
end $$;

revoke all on function public.remover_cadastro_simples(text, bigint) from public, anon, service_role;
grant execute on function public.remover_cadastro_simples(text, bigint) to authenticated;
