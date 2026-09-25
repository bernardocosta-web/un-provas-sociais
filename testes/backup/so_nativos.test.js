import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// O backup.yml nao roda npm install: scripts/backup.mjs e scripts/backup/
// so podem depender de modulos nativos do Node. Duas redes:
// 1. varredura de TODA forma de dependencia (import estatico em varias
//    linhas, `import 'x'`, `export ... from`, import() e require), e import()
//    com argumento que nao e texto literal e recusado (nao da para conferir);
// 2. execucao de verdade: os arquivos sao copiados para uma pasta temporaria
//    sem node_modules em nenhum ancestral, e cada modulo e carregado pelo node.

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ARQUIVOS = [path.join(raiz, 'scripts', 'backup.mjs'),
  ...readdirSync(path.join(raiz, 'scripts', 'backup')).map((f) => path.join(raiz, 'scripts', 'backup', f))]

const ESPECIFICADOR = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"`])([^'"`]+)\1/g
const IMPORT_DINAMICO = /\b(?:import|require)\s*\(\s*(?!['"`])/g

function dependenciasExternas(fonte) {
  // Comentarios fora: texto como "import de x" em comentario nao conta.
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const externas = [...codigo.matchAll(ESPECIFICADOR)].map((m) => m[2])
    .filter((e) => !e.startsWith('node:') && !e.startsWith('./') && !e.startsWith('../'))
  const dinamicos = [...codigo.matchAll(IMPORT_DINAMICO)].map(() => '(import dinamico nao literal)')
  return [...externas, ...dinamicos]
}

describe('varredura de dependencias', () => {
  it.each([
    ['multilinha', "import {\n  google\n} from\n  'googleapis'"],
    ['sem nome', "import 'dotenv/config'"],
    ['reexportacao', "export { x } from 'pacote'"],
    ['reexportacao total', "export * from \"pacote\""],
    ['dinamico literal', "const m = await import('pacote')"],
    ['dinamico variavel', 'const m = await import(nome)'],
    ['require', "const m = require('pacote')"],
    ['modulo nativo sem node:', "import fs from 'fs'"],
  ])('pega %s', (nome, fonte) => {
    expect(dependenciasExternas(fonte)).not.toEqual([])
  })

  it('aceita node: e relativos, ignora comentarios', () => {
    expect(dependenciasExternas(
      "import { x } from './a.js'\nimport fs from 'node:fs'\n// import 'nada'\n/* require('nada') */")).toEqual([])
  })

  it('os arquivos do backup so dependem de node: e de relativos', () => {
    expect(ARQUIVOS.length).toBeGreaterThan(10)
    const achados = ARQUIVOS.flatMap((f) =>
      dependenciasExternas(readFileSync(f, 'utf8')).map((d) => `${path.basename(f)}: ${d}`))
    expect(achados).toEqual([])
  })
})

describe('carregamento de verdade, longe de qualquer node_modules', () => {
  let pasta
  beforeAll(() => {
    pasta = mkdtempSync(path.join(os.tmpdir(), 'backup-nativos-'))
    cpSync(path.join(raiz, 'scripts', 'backup.mjs'), path.join(pasta, 'backup.mjs'))
    cpSync(path.join(raiz, 'scripts', 'backup'), path.join(pasta, 'backup'), { recursive: true })
  })
  afterAll(() => rmSync(pasta, { recursive: true, force: true }))

  it('nenhum ancestral da pasta temporaria tem node_modules', () => {
    for (let d = pasta; ; d = path.dirname(d)) {
      expect(existsSync(path.join(d, 'node_modules')), d).toBe(false)
      if (path.dirname(d) === d) break
    }
  })

  it('cada modulo de scripts/backup/ carrega', () => {
    for (const f of readdirSync(path.join(pasta, 'backup'))) {
      const url = pathToFileURL(path.join(pasta, 'backup', f)).href
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)})`],
        { encoding: 'utf8' })
      expect(r.status, `${f}: ${r.stderr}`).toBe(0)
    }
  })

  it('backup.mjs carrega todos os imports e chega a ler a configuracao', () => {
    const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot }
    const r = spawnSync(process.execPath, [path.join(pasta, 'backup.mjs')], { encoding: 'utf8', env })
    expect(r.stderr).not.toMatch(/ERR_MODULE_NOT_FOUND|Cannot find/)
    expect(r.stderr).toMatch(/Faltam variaveis de ambiente/)
    expect(r.status).toBe(1)
  })
})
