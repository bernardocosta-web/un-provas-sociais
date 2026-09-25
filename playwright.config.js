// e2e no navegador contra o Supabase LOCAL (npx supabase start antes).
// Nunca produção: URL e chave publicável vêm da stack local e são injetadas
// no processo do Vite; o .env (que aponta para o projeto hospedado) perde
// para o ambiente. A fixture de e2e/ajuda/teste.js ainda aborta e reprova
// qualquer requisição a *.supabase.co.
import { defineConfig, devices } from '@playwright/test'
import { ambienteLocal, PORTA_VITE, URL_APP } from './e2e/ajuda/ambiente.js'

const { url, chave } = ambienteLocal()
process.env.VITE_SUPABASE_URL = url
process.env.VITE_SUPABASE_ANON_KEY = chave
// Definido uma vez no processo principal; os workers herdam pelo ambiente.
process.env.E2E_MARCADOR ??= `E2E-${Date.now()}`

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.js',
  // Capturas de tela do checklist (e2e/capturas.spec.js) so com
  // E2E_CAPTURAS=1 (npm run test:e2e:capturas); fora da suite normal.
  testIgnore: process.env.E2E_CAPTURAS === '1' ? [] : ['**/capturas.spec.js'],
  // Os fluxos mexem no mesmo banco.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  globalSetup: './e2e/global-setup.js',
  globalTeardown: './e2e/global-teardown.js',
  use: {
    baseURL: URL_APP,
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${PORTA_VITE} --strictPort`,
    url: URL_APP,
    // Nunca aproveitar um servidor já de pé: ele pode estar com o .env de produção.
    reuseExistingServer: false,
    timeout: 60_000,
    env: { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: chave },
  },
})
