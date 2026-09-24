import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Nenhum arquivo do projeto pode ter BOM (EF BB BF): editores/parsers que não
// esperam BOM (ex.: alguns loaders de .env, alguns parsers de SQL) quebram em
// silêncio ou com erro confuso. Ferramentas do Windows (PowerShell
// Set-Content/Out-File) costumam adicionar BOM sem avisar — este teste é a
// rede de segurança contra isso.

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function raizDoRepo() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: __dirname,
    encoding: 'utf8',
  }).trim()
}

function arquivosRastreados(raiz) {
  return execFileSync('git', ['ls-files'], { cwd: raiz, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
}

// git-attributes marca binários (ex.: *.png) com o atributo `binary`. Eles
// não têm "BOM" no sentido de texto e não entram na varredura.
function arquivosBinarios(raiz, arquivos) {
  if (arquivos.length === 0) return new Set()
  const saida = execFileSync('git', ['check-attr', 'binary', '--', ...arquivos], {
    cwd: raiz,
    encoding: 'utf8',
  })
  const binarios = new Set()
  for (const linha of saida.split('\n')) {
    const m = linha.match(/^(.*): binary: (.*)$/)
    if (m && m[2].trim() === 'set') binarios.add(m[1])
  }
  return binarios
}

function temBom(caminhoAbsoluto) {
  const bytes = readFileSync(caminhoAbsoluto)
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
}

describe('arquivos rastreados nao tem BOM', () => {
  it('nenhum arquivo textual comeca com EF BB BF', () => {
    const raiz = raizDoRepo()
    const todos = arquivosRastreados(raiz)
    const binarios = arquivosBinarios(raiz, todos)
    const textuais = todos.filter((arquivo) => !binarios.has(arquivo))
    const comBom = textuais.filter((arquivo) => temBom(path.join(raiz, arquivo)))
    expect(comBom, `Arquivos com BOM (EF BB BF): ${comBom.join(', ')}`).toEqual([])
  })
})
