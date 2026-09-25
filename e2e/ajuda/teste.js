// Fixture compartilhada de todas as specs:
// - trava de produção: toda requisição a *.supabase.co é abortada e o teste
//   falha no fim, com a lista do que tentou sair;
// - confirm() aceito (Remover pergunta antes; o Playwright recusaria);
// - entrarComo('membro' | 'estranho'): injeta a sessão no localStorage, com a
//   chave que o supabase-js usa para este URL, antes de a app carregar.
import { test as base, expect } from '@playwright/test'
import { ambienteLocal, PADRAO_HOSPEDADO } from './ambiente.js'
import { emailMembro, emailEstranho, sessaoDe } from './usuarios.js'

// supabase-js: `sb-${hostname.split('.')[0]}-auth-token` — "sb-127-auth-token".
export const CHAVE_SESSAO = `sb-${new URL(ambienteLocal().url).hostname.split('.')[0]}-auth-token`

const EMAILS = { membro: emailMembro, estranho: emailEstranho }

export const test = base.extend({
  page: async ({ page }, use) => {
    const bloqueadas = []
    await page.context().route(PADRAO_HOSPEDADO, (rota) => {
      bloqueadas.push(rota.request().url())
      return rota.abort('blockedbyclient')
    })
    page.on('dialog', (dialogo) => dialogo.accept())
    await use(page)
    expect(bloqueadas, 'requisições a um Supabase hospedado').toEqual([])
  },

  entrarComo: async ({ page }, use) => {
    await use(async (papel) => {
      const sessao = await sessaoDe(EMAILS[papel]())
      await page.addInitScript(([chave, valor]) => {
        window.localStorage.setItem(chave, valor)
      }, [CHAVE_SESSAO, JSON.stringify(sessao)])
      return sessao
    })
  },
})

export { expect }
