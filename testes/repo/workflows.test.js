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
  describe('backup.yml (Task 23)', () => {
    let texto
    let doc
    let passos
    beforeAll(() => {
      ;({ texto, doc } = lerWorkflow('backup.yml'))
      passos = Object.values(doc.jobs)[0].steps
    })
    const indiceDoScript = () => passos.findIndex((p) => /node scripts\/backup\.mjs/.test(p.run ?? ''))

    it('dispara agendado (diario) e manualmente, e nada mais', () => {
      expect(Object.keys(doc.on).sort()).toEqual(['schedule', 'workflow_dispatch'])
      expect(doc.on.schedule).toEqual([{ cron: '0 6 * * *' }])
    })

    it('um job, com timeout, Node 22 e permissao so de leitura', () => {
      expect(Object.keys(doc.jobs)).toHaveLength(1)
      const job = Object.values(doc.jobs)[0]
      expect(job['timeout-minutes']).toBeGreaterThan(0)
      expect(job['timeout-minutes']).toBeLessThanOrEqual(30)
      expect(doc.permissions).toEqual({ contents: 'read' })
      const node = passos.find((p) => p.uses?.startsWith('actions/setup-node@'))
      expect(node?.with?.['node-version']).toBe('22')
    })

    it('instala o pg_dump 17 pelo PGDG e confere a versao antes do backup', () => {
      const idxPg = passos.findIndex((p) => /apt\.postgresql\.org\.sh/.test(p.run ?? '') &&
        /postgresql-client-17/.test(p.run ?? ''))
      const idxVersao = passos.findIndex((p) => /pg_dump --version/.test(p.run ?? '') && /17/.test(p.run ?? ''))
      expect(idxPg, 'nenhum passo instala postgresql-client-17 pelo PGDG').toBeGreaterThanOrEqual(0)
      expect(idxVersao).toBeGreaterThan(idxPg)
      expect(indiceDoScript()).toBeGreaterThan(idxVersao)
    })

    it('o script (que manda o ping de sucesso por ultimo) e o ultimo passo que roda no sucesso', () => {
      const idx = indiceDoScript()
      expect(idx, 'nenhum passo roda node scripts/backup.mjs').toBeGreaterThanOrEqual(0)
      // Depois dele, so passos condicionados a falha.
      const depois = passos.slice(idx + 1)
      expect(depois.length).toBeGreaterThan(0)
      for (const p of depois) expect(p.if).toBe('failure() || cancelled()')
      // Nenhum passo antes dele pinga o Healthchecks com sucesso.
      for (const p of passos.slice(0, idx)) expect(p.env?.HEALTHCHECKS_PING_URL).toBeUndefined()
    })

    it('manda /fail ao Healthchecks quando algo falha ou e cancelado', () => {
      // Cancelado (timeout do job, cancelamento manual) tambem avisa.
      const falha = passos.filter((p) => p.if === 'failure() || cancelled()')
      expect(falha.some((p) => /HEALTHCHECKS_PING_URL\/fail/.test(p.run ?? ''))).toBe(true)
    })

    it('usa exatamente os Secrets do backup, sempre por env (nunca interpolados em run:)', () => {
      const todosSecrets = [...texto.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1])
      expect(new Set(todosSecrets)).toEqual(new Set(['SUPABASE_DB_URL', 'VITE_SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY', 'GDRIVE_SA_JSON', 'GDRIVE_OAUTH_CLIENT', 'GDRIVE_REFRESH_TOKEN',
        'GDRIVE_FOLDER_ID', 'HEALTHCHECKS_PING_URL']))
      for (const p of passos) expect(p.run ?? '', p.name).not.toMatch(/\$\{\{/)
      // Enderecos falsos do Google sao so dos testes.
      expect(texto).not.toMatch(/BACKUP_URL_GOOGLE/)
    })

    it('nunca reseta nem aponta para o banco local, e nao faz npm install avulso', () => {
      expect(texto).not.toMatch(/db reset/)
      expect(texto).not.toMatch(/--local\b/)
      expect(texto).not.toMatch(/npm install/)
    })

    it('passa no actionlint', () => {
      expect(lint(texto, 'backup.yml')).toEqual([])
    })
  })

  // Subprojeto #2 (ADR 0001): CI do banco descartavel. Sobe a stack local,
  // reaplica todas as migracoes do zero e roda os testes de RLS/banco e o
  // pytest do importador. Nunca ve Secret nem o projeto hospedado.
  describe('db-tests.yml', () => {
    let texto
    let doc
    beforeAll(() => {
      ;({ texto, doc } = lerWorkflow('db-tests.yml'))
    })

    it('dispara em push e pull_request', () => {
      // `on:` aceita lista curta ([push, pull_request]) ou mapa.
      const eventos = Array.isArray(doc.on) ? doc.on : Object.keys(doc.on)
      expect(eventos).toEqual(expect.arrayContaining(['push', 'pull_request']))
    })

    it('um job, sem matriz, com timeout', () => {
      expect(Object.keys(doc.jobs)).toHaveLength(1)
      const job = Object.values(doc.jobs)[0]
      expect(job.strategy?.matrix).toBeUndefined()
      expect(job['timeout-minutes']).toBeGreaterThan(0)
    })

    it('nao referencia Secret nem o hospedado', () => {
      expect(texto).not.toMatch(/secrets\./)
      expect(texto).not.toMatch(/SERVICE_ROLE/)
      expect(texto).not.toMatch(/db push|--linked|supabase link/)
    })

    it('sobe a stack, reaplica as migracoes do zero e so depois roda RLS e pytest', () => {
      const runs = comandosRun(Object.values(doc.jobs)[0])
      const idx = (re) => runs.findIndex((r) => re.test(r))
      const start = idx(/supabase start/)
      const reset = idx(/supabase db reset --local/)
      const rls = idx(/vitest run testes\/rls/)
      const pytest = idx(/pytest importadores/)
      expect(start, 'nenhum passo roda `supabase start`').toBeGreaterThanOrEqual(0)
      expect(reset, 'nenhum passo reaplica as migracoes (`supabase db reset --local`)').toBeGreaterThan(start)
      expect(rls, 'nenhum passo roda os testes de RLS').toBeGreaterThan(reset)
      expect(pytest, 'nenhum passo roda o pytest do importador').toBeGreaterThan(reset)
    })

    it('passa no actionlint', () => {
      expect(lint(texto, 'db-tests.yml')).toEqual([])
    })
  })
})
