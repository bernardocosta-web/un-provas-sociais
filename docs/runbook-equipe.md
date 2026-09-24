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
