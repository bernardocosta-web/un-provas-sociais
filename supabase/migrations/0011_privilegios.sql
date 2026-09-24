-- Privilegio minimo e paridade com o projeto hospedado. La, "Automatically
-- expose new tables" esta desligado: tabela nova em public nao recebe nada
-- para anon/authenticated/service_role. O Supabase local concede tudo por
-- padrao, e os testes nao refletiam a producao. Daqui em diante toda tabela
-- e funcao usada pelo app recebe GRANT explicito na migracao que a cria.
-- A RLS continua decidindo quais linhas cada um ve; o privilegio decide se
-- o papel pode sequer tocar o objeto.

-- 1. Objetos futuros criados por postgres (o papel que roda as migracoes)
--    em public nao recebem nada dos papeis da API.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role, public;

-- O EXECUTE para PUBLIC em funcao e padrao embutido do Postgres, e padrao
-- por schema so soma aos globais: o revoke acima, sozinho, nao tira nada
-- de PUBLIC (verificado criando uma funcao depois dele). So o revoke
-- global resolve. Alcanca funcoes que postgres criar em qualquer schema.
alter default privileges for role postgres
  revoke execute on functions from public;

-- 2. Zera o que ja foi concedido em public.
revoke all on all tables in schema public from anon, authenticated, service_role, public;
revoke all on all sequences in schema public from anon, authenticated, service_role, public;
revoke all on all functions in schema public from anon, authenticated, service_role, public;

-- 3. Concede so o necessario, tabela por tabela (nada de "on all tables":
--    esconderia tabela esquecida). Ninguem escreve membro_equipe pela API.
grant select on membro_equipe to authenticated;

grant select, insert, update, delete on instituicao         to authenticated;
grant select, insert, update, delete on instituicao_apelido to authenticated;
grant select, insert, update, delete on prova               to authenticated;
grant select, insert, update, delete on curso               to authenticated;
grant select, insert, update, delete on materia             to authenticated;
grant select, insert, update, delete on aluno               to authenticated;
grant select, insert, update, delete on aluno_perfil        to authenticated;
grant select, insert, update, delete on depoimento          to authenticated;
grant select, insert, update, delete on depoimento_tipo     to authenticated;
grant select, insert, update, delete on depoimento_canal    to authenticated;
grant select, insert, update, delete on participacao        to authenticated;
grant select, insert, update, delete on nota                to authenticated;
grant select, insert, update, delete on resultado           to authenticated;

-- As politicas (inclusive as de storage.objects) chamam eh_membro_equipe()
-- como o papel da consulta. Funcoes de trigger nao precisam de EXECUTE: o
-- trigger dispara sem checar privilegio de quem fez o update. Sequencias de
-- identidade tambem nao: o nextval implicito nao checa privilegio.
grant execute on function public.eh_membro_equipe()         to authenticated;
grant execute on function public.buscar_depoimentos(jsonb)  to authenticated;
