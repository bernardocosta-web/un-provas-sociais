# Runbook — Equipe

## Login com Google e política de privacidade

O login do dashboard é só com o Google (ver invariante no `CLAUDE.md`). Para
publicar a tela de consentimento OAuth, o Google exige uma página inicial e
uma política de privacidade acessíveis por URL.

**Onde configurar:** Google Auth Platform (console do Google Cloud), na conta
Google da equipe do Universo Narrado — abas Branding / Audience / Data Access
/ Clients.

**Estado atual:** tela de consentimento publicada **"Em produção"**, com:

- **Página inicial:** `https://bernardocosta-web.github.io/un-provas-sociais/`
- **Política de privacidade:** `https://bernardocosta-web.github.io/un-provas-sociais/privacidade.html`
- **Domínios autorizados:** o domínio do projeto Supabase e
  `bernardocosta-web.github.io`

**Fonte da página de privacidade:** `public/privacidade.html`. É uma página
estática fora da SPA — o Vite copia `public/` para `dist/` sem processar —
então ela é servida direto pelo GitHub Pages, sem depender do roteador Vue.

**Se o conteúdo da página mudar de URL ou sair do ar,** a tela de
consentimento no Google Auth Platform precisa ser atualizada junto: as duas
URLs acima (home e privacidade) e os domínios autorizados estão gravados lá
como parte da publicação "Em produção", e ficam desatualizados em silêncio se
só o arquivo do repositório mudar.

## Adicionar e remover membros da equipe

Não há tela de administração: para uma equipe deste tamanho, ela gastaria
esforço num problema que acontece duas vezes por ano, e uma conta comprometida
poderia usá-la para adicionar outra. Nenhum e-mail real aparece neste runbook —
os exemplos abaixo são placeholders.

### Adicionar

1. Painel do Supabase → **SQL Editor**
2. Executar, trocando os valores:

       insert into membro_equipe (email, nome, ativo)
       values ('pessoa@universonarrado.com', 'Nome da Pessoa', true);

   O e-mail precisa estar em minúsculas — há um `CHECK` que exige isso.
3. Pedir que a pessoa entre com Google e confirme que a lista carrega.

### Remover

       update membro_equipe set ativo = false
        where email = 'pessoa@universonarrado.com';

**Desativar, nunca apagar.** O histórico de quem teve acesso tem valor, e
apagar a linha apagaria a rastreabilidade.

### Conferir quem tem acesso

       select email, nome, ativo, criado_em from membro_equipe order by nome;

Só `ativo = true` entra nas checagens de `eh_membro_equipe()` — uma linha com
`ativo = false` fica na tabela (histórico), mas não dá mais acesso.
