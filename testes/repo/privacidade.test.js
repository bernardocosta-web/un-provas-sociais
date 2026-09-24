import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Google exige, para publicar a tela de consentimento OAuth "Em producao",
// uma pagina inicial e uma politica de privacidade acessiveis por URL. Esta
// pagina e estatica, fora da SPA (o Vite copia public/ para dist/ sem
// processar), servida em /un-provas-sociais/privacidade.html.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(__dirname, '..', '..')
const caminho = path.join(raiz, 'public', 'privacidade.html')

describe('pagina estatica de privacidade (public/privacidade.html)', () => {
  it('existe no disco', () => {
    expect(existsSync(caminho), `arquivo ausente: ${caminho}`).toBe(true)
  })

  it('tem lang pt-BR, meta utf-8, titulo, menciona contato e Google, sem recursos externos', () => {
    const html = readFileSync(caminho, 'utf8')
    expect(html).toMatch(/<html[^>]*\slang=["']pt-BR["']/)
    expect(html).toMatch(/<meta[^>]*charset=["']utf-8["']/i)
    expect(html).toMatch(/<title>[^<]+<\/title>/)
    expect(html).toContain('bernardocosta.dsg@gmail.com')
    expect(html).toContain('Google')
    // Pagina deve ser autocontida: nada de script ou folha de estilo externa.
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/<link[^>]*\brel=["']stylesheet["']/i)
  })
})
