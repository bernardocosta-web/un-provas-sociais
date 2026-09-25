import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { createLinter } from 'actionlint'

// Valida os workflows do GitHub Actions sem depender do GitHub: parseia o
// YAML e confere os invariantes da Task 25 (job unico e sem matriz em
// testes.yml — a limpeza dos e2e apaga todo dado E2E-% da stack, e duas
// execucoes no mesmo banco se atropelariam —, nenhum Secret em testes.yml,
// deploy.yml so publica depois de "Testes" passar e so com as duas chaves
// publicaveis, migracoes.yml so manual e com exatamente os tres Secrets
// esperados). actionlint roda 100% local via wasm (pacote `actionlint`, sem
// CLI nem download em tempo de execucao) e pega erros que o parser de YAML
// puro nao pega (sintaxe de expressao `${{ }}`, contextos invalidos etc.) —
// mas nao pega tudo: um nome de input errado num `with:` de uma action de
// terceiro (ex.: `projetc-ref` por engano) nao tem schema local para
// conferir, e passa batido tanto no actionlint quanto neste teste (fix
// round 1).

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const raizWorkflows = path.resolve(__dirname, '..', '..', '.github', 'workflows')

function lerWorkflow(nome) {
  const caminho = path.join(raizWorkflows, nome)
  expect(existsSync(caminho), `arquivo ausente: ${nome}`).toBe(true)
  const texto = readFileSync(caminho, 'utf8')
  return { texto, doc: parse(texto) }
}

function comandosRun(job) {
  return job.steps
    .filter((passo) => typeof passo.run === 'string')
    .map((passo) => passo.run)
}

describe('workflows do GitHub Actions (Task 25)', () => {
  let lint
  beforeAll(async () => {
    lint = await createLinter()
  })

  describe('testes.yml', () => {
    let texto
    let doc
    beforeAll(() => {
      ;({ texto, doc } = lerWorkflow('testes.yml'))
    })

    it('tem exatamente um job', () => {
      expect(Object.keys(doc.jobs)).toHaveLength(1)
    })

    it('nenhum job usa strategy.matrix', () => {
      for (const job of Object.values(doc.jobs)) {
        expect(job.strategy?.matrix, 'matriz encontrada: um unico job por stack').toBeUndefined()
      }
    })

    it('nao referencia nenhum Secret (e2e nunca ve segredo de producao)', () => {
      expect(texto).not.toMatch(/secrets\./)
    })

    it('sobe a stack, instala o Chromium, roda npm test e so depois npm run test:e2e', () => {
      const job = Object.values(doc.jobs)[0]
      const runs = comandosRun(job)
      const idxSupabaseStart = runs.findIndex((r) => /supabase start/.test(r))
      const idxPlaywrightInstall = runs.findIndex((r) => /playwright install/.test(r))
      const idxNpmTest = runs.findIndex((r) => /(^|\s)npm test(\s|$)/.test(r))
      const idxE2e = runs.findIndex((r) => /npm run test:e2e/.test(r))

      expect(idxSupabaseStart, 'nenhum passo roda `supabase start`').toBeGreaterThanOrEqual(0)
      expect(idxPlaywrightInstall, 'nenhum passo instala o Playwright').toBeGreaterThanOrEqual(0)
      expect(idxNpmTest, 'nenhum passo roda `npm test`').toBeGreaterThanOrEqual(0)
      expect(idxE2e, 'nenhum passo roda `npm run test:e2e`').toBeGreaterThanOrEqual(0)

      expect(idxPlaywrightInstall).toBeGreaterThan(idxSupabaseStart)
      expect(idxNpmTest).toBeGreaterThan(idxPlaywrightInstall)
      expect(idxE2e).toBeGreaterThan(idxNpmTest)
    })

    it('passa no actionlint', () => {
      expect(lint(texto, 'testes.yml')).toEqual([])
    })
  })

  describe('deploy.yml', () => {
    let texto
    let doc
    beforeAll(() => {
      ;({ texto, doc } = lerWorkflow('deploy.yml'))
    })

    it('builda so com as duas chaves publicaveis (nunca service_role/DB)', () => {
      const todosSecrets = [...texto.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1])
      expect(todosSecrets.length, 'deploy.yml deveria referenciar Secrets no build').toBeGreaterThan(0)
      expect(new Set(todosSecrets)).toEqual(
        new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']),
      )
    })

    it('nunca menciona SERVICE_ROLE nem senha de banco', () => {
      expect(texto).not.toMatch(/SERVICE_ROLE/)
      expect(texto).not.toMatch(/DB_PASSWORD/)
    })

    it('so publica depois que "Testes" passa (ou por disparo manual)', () => {
      expect(doc.on.workflow_run?.workflows, 'deveria reagir ao workflow "Testes"').toEqual(['Testes'])
      expect(doc.on.workflow_run?.types).toEqual(['completed'])
      expect(doc.on).toHaveProperty('workflow_dispatch')
      // push direto em branches nao gate-ia por resultado nenhum: so que o
      // evento aconteceu. Sem essa chave, um push com testes quebrados
      // publicaria o build quebrado.
      expect(doc.on).not.toHaveProperty('push')

      const job = Object.values(doc.jobs)[0]
      expect(job.if, 'job deveria ter um `if` checando o resultado do workflow_run').toMatch(
        /workflow_run\.conclusion/,
      )
      expect(job.if).toMatch(/workflow_dispatch/)
    })

    it('faz checkout do SHA testado pelo workflow_run, nao do HEAD atual', () => {
      const job = Object.values(doc.jobs)[0]
      const checkout = job.steps.find((passo) => passo.uses?.startsWith('actions/checkout@'))
      expect(checkout?.with?.ref).toMatch(/workflow_run\.head_sha/)
    })

    it('tem concurrency de publicacao (grupo unico, sem cancelar em andamento)', () => {
      expect(doc.concurrency).toEqual({ group: 'pages', 'cancel-in-progress': false })
    })

    it('passa no actionlint', () => {
      expect(lint(texto, 'deploy.yml')).toEqual([])
    })
  })

  describe('migracoes.yml', () => {
    let texto
    let doc
    beforeAll(() => {
      ;({ texto, doc } = lerWorkflow('migracoes.yml'))
    })

    it('so dispara manualmente (workflow_dispatch), nunca em push/pull_request', () => {
      const gatilhos = Object.keys(doc.on)
      expect(gatilhos).toEqual(['workflow_dispatch'])
    })

    it('usa exatamente os tres Secrets esperados, nenhum a mais', () => {
      const todosSecrets = [...texto.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1])
      expect(new Set(todosSecrets)).toEqual(
        new Set(['SUPABASE_PROJECT_REF', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD']),
      )
    })

    it('nunca reseta nem aponta para o banco local (produção de verdade, sem atalho)', () => {
      expect(texto).not.toMatch(/db reset/)
      expect(texto).not.toMatch(/--local\b/)
    })

    it('passa no actionlint', () => {
      expect(lint(texto, 'migracoes.yml')).toEqual([])
    })
  })
})
