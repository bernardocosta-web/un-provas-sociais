import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { subirDriveFalso, TOKEN_FALSO } from './ajuda/driveFalso.js'
import { subirServidor, responderJson } from './ajuda/servidor.js'

// scripts/backup.mjs como processo de verdade (codigo de saida, stderr), com
// Google e Healthchecks falsos locais. O caminho feliz com Supabase de
// verdade esta em integracao.test.js (la o dump roda pelo docker exec).

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SEGREDO = 'refresh-token-que-nao-pode-vazar'

let drive
let google
let hc
let rest
beforeEach(async () => {
  drive = await subirDriveFalso({ pastas: [{ id: 'pasta-ok' }] })
  google = await subirServidor((req, corpo, res) => responderJson(res, 200, { access_token: TOKEN_FALSO }))
  hc = await subirServidor((req, corpo, res) => { res.writeHead(200); res.end('OK') })
  // PostgREST falso: so o ping anti-pausa chega ate ele.
  rest = await subirServidor((req, corpo, res) => responderJson(res, 200, [{ id: 1 }]))
})
afterEach(async () => {
  await Promise.all([drive.fechar(), google.fechar(), hc.fechar(), rest.fechar()])
})

function rodar(ambiente) {
  const env = { ...process.env }
  for (const k of Object.keys(env)) if (/^(GDRIVE_|SUPABASE_|HEALTHCHECKS_|BACKUP_)/.test(k)) delete env[k]
  return new Promise((ok) => {
    const p = spawn(process.execPath, [path.join(raiz, 'scripts', 'backup.mjs')], { env: { ...env, ...ambiente } })
    let saida = ''
    p.stdout.on('data', (d) => { saida += d })
    p.stderr.on('data', (d) => { saida += d })
    p.on('close', (codigo) => ok({ codigo, saida }))
  })
}

const ambienteCompleto = () => ({
  SUPABASE_DB_URL: 'postgresql://postgres:x@127.0.0.1:1/postgres',
  SUPABASE_URL: rest.url,
  SUPABASE_SERVICE_ROLE_KEY: 'chave',
  GDRIVE_SA_JSON: '',
  GDRIVE_OAUTH_CLIENT: JSON.stringify({ client_id: 'cid', client_secret: 'csec' }),
  GDRIVE_REFRESH_TOKEN: SEGREDO,
  GDRIVE_FOLDER_ID: 'pasta-que-nao-existe',
  HEALTHCHECKS_PING_URL: `${hc.url}/ping/x`,
  BACKUP_URL_GOOGLE_API: drive.url,
  BACKUP_URL_GOOGLE_TOKEN: `${google.url}/token`,
})

describe('scripts/backup.mjs', () => {
  it('configuracao incompleta: sai com 1, diz o que falta e manda /fail', async () => {
    const { codigo, saida } = await rodar({ HEALTHCHECKS_PING_URL: `${hc.url}/ping/x`, GDRIVE_REFRESH_TOKEN: SEGREDO })
    expect(codigo).toBe(1)
    expect(saida).toMatch(/::error::Faltam variaveis de ambiente.*SUPABASE_DB_URL/)
    expect(saida).not.toContain(SEGREDO)
    expect(hc.requisicoes.map((r) => r.caminho)).toEqual(['/ping/x/fail'])
  })

  it('pasta inacessivel: sai com 1 com a mensagem do verificador, /start + /fail, nada escrito no Drive', async () => {
    const { codigo, saida } = await rodar(ambienteCompleto())
    expect(codigo).toBe(1)
    expect(saida).toMatch(/::error::Nao consegui acessar a pasta do backup no Google Drive \(Rota B\).*GDRIVE_FOLDER_ID/)
    expect(saida).not.toContain(SEGREDO)
    expect(hc.requisicoes.map((r) => r.caminho)).toEqual(['/ping/x/start', '/ping/x/fail'])
    expect(drive.requisicoes.filter((r) => r.metodo !== 'GET')).toEqual([])
    // O ping anti-pausa saiu mesmo com o Drive inacessivel.
    expect(rest.requisicoes.map((r) => `${r.caminho}?${r.busca}`)).toEqual(['/rest/v1/curso?select=id&limit=1'])
    // Rota B de verdade: o refresh token foi trocado no endpoint de token.
    expect(new URLSearchParams(google.requisicoes[0].corpo.toString()).get('grant_type')).toBe('refresh_token')
  })
})
