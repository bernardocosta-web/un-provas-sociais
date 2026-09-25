import { subirServidor, responderJson } from './servidor.js'

// Google Drive v3 simulado num servidor HTTP local, so com o que o backup usa:
// files.get, files.list (q com a gramatica exata que scripts/backup/drive.js
// gera — clausula desconhecida responde 400, para o teste pegar q errada),
// files.create (pasta), upload resumable e files.delete. Arquivos em memoria.
// `falhar(req, url)` pode devolver { status, motivo } para simular erro.

export const TOKEN_FALSO = 'token-falso-do-drive'

function erroGoogle(res, status, motivo, mensagem = motivo) {
  responderJson(res, status, { error: { code: status, message: mensagem, errors: [{ reason: motivo }] } })
}

const TEXTO = "'((?:[^'\\\\]|\\\\.)*)'"
const desescapar = (s) => s.replace(/\\(.)/g, '$1')

// Converte q em lista de predicados; lanca se sobrar algo nao reconhecido.
function compilarQ(q) {
  const regras = [
    [new RegExp(`^${TEXTO} in parents$`), (m) => (a) => a.parents.includes(desescapar(m[1]))],
    [/^trashed = false$/, () => (a) => !a.trashed],
    [new RegExp(`^appProperties has \\{ key=${TEXTO} and value=${TEXTO} \\}$`),
      (m) => (a) => a.appProperties?.[desescapar(m[1])] === desescapar(m[2])],
  ]
  // Separa por " and " fora de chaves e de aspas.
  const clausulas = []
  let atual = ''
  let chaves = 0
  let aspas = false
  for (let i = 0; i < q.length; i++) {
    const c = q[i]
    if (c === '\\' && aspas) { atual += c + q[++i]; continue }
    if (c === "'") aspas = !aspas
    if (!aspas && c === '{') chaves++
    if (!aspas && c === '}') chaves--
    if (!aspas && chaves === 0 && q.startsWith(' and ', i)) {
      clausulas.push(atual); atual = ''; i += 4; continue
    }
    atual += c
  }
  clausulas.push(atual)
  return clausulas.map((cl) => {
    for (const [re, criar] of regras) {
      const m = re.exec(cl.trim())
      if (m) return criar(m)
    }
    throw new Error(`clausula de q nao suportada: ${cl}`)
  })
}

export async function subirDriveFalso({ pastas = [], falhar = () => null } = {}) {
  const arquivos = new Map()
  const sessoes = new Map()
  let sequencia = 0
  let relogio = Date.parse('2026-01-01T00:00:00Z')
  const novoId = () => `arq-${++sequencia}`
  const carimbo = () => new Date((relogio += 1000)).toISOString()

  for (const p of pastas) {
    arquivos.set(p.id, { name: 'Backups', mimeType: 'application/vnd.google-apps.folder',
      parents: [], appProperties: {}, trashed: false, createdTime: carimbo(), ...p })
  }

  const metadados = ({ conteudo, ...resto }) => resto

  const servidor = await subirServidor((req, corpo, res, url) => {
    if (req.headers.authorization !== `Bearer ${TOKEN_FALSO}`) {
      return erroGoogle(res, 401, 'authError', 'Invalid Credentials')
    }
    const falha = falhar(req, url)
    if (falha) return erroGoogle(res, falha.status, falha.motivo ?? 'falhaSimulada')

    const partes = url.pathname.split('/').filter(Boolean)
    if (partes[0] === 'upload' && partes[1] === 'sessao' && req.method === 'PUT') {
      const sessao = sessoes.get(partes[2])
      if (!sessao) return erroGoogle(res, 404, 'notFound')
      sessoes.delete(partes[2])
      const id = novoId()
      arquivos.set(id, { ...sessao, id, conteudo: corpo, trashed: false, createdTime: carimbo() })
      return responderJson(res, 200, { id, name: sessao.name })
    }
    if (url.pathname === '/upload/drive/v3/files' && req.method === 'POST') {
      if (url.searchParams.get('uploadType') !== 'resumable') return erroGoogle(res, 400, 'badRequest')
      const meta = JSON.parse(corpo.toString('utf8'))
      const chave = String(sessoes.size + sequencia + Math.random()).replace('.', '')
      sessoes.set(chave, { name: meta.name, mimeType: meta.mimeType, parents: meta.parents ?? [],
        appProperties: meta.appProperties ?? {}, description: meta.description })
      res.writeHead(200, { Location: `${servidor.url}/upload/sessao/${chave}` })
      return res.end()
    }
    if (partes.slice(0, 3).join('/') !== 'drive/v3/files') return erroGoogle(res, 404, 'notFound')

    const id = partes[3]
    if (!id && req.method === 'GET') {
      let filtros
      try {
        filtros = compilarQ(url.searchParams.get('q') ?? '')
      } catch (e) {
        return erroGoogle(res, 400, 'invalid', e.message)
      }
      const todos = [...arquivos.values()].filter((a) => filtros.every((f) => f(a)))
      const tamanho = Number(url.searchParams.get('pageSize') ?? 100)
      const inicio = Number(url.searchParams.get('pageToken') ?? 0)
      const pagina = todos.slice(inicio, inicio + tamanho).map(metadados)
      const proximo = inicio + tamanho < todos.length ? String(inicio + tamanho) : undefined
      return responderJson(res, 200, { files: pagina, ...(proximo ? { nextPageToken: proximo } : {}) })
    }
    if (!id && req.method === 'POST') {
      const meta = JSON.parse(corpo.toString('utf8'))
      const novo = novoId()
      arquivos.set(novo, { id: novo, name: meta.name, mimeType: meta.mimeType, parents: meta.parents ?? [],
        appProperties: meta.appProperties ?? {}, trashed: false, createdTime: carimbo() })
      return responderJson(res, 200, { id: novo, name: meta.name })
    }
    const arquivo = arquivos.get(id)
    if (!arquivo) return erroGoogle(res, 404, 'notFound', `File not found: ${id}.`)
    if (req.method === 'GET') return responderJson(res, 200, metadados(arquivo))
    if (req.method === 'DELETE') {
      arquivos.delete(id)
      res.writeHead(204)
      return res.end()
    }
    return erroGoogle(res, 405, 'methodNotAllowed')
  })

  return {
    ...servidor,
    arquivos,
    // Arquivos (nao pastas) filhos de `pai`, por nome.
    filhos: (pai) => [...arquivos.values()].filter((a) => a.parents.includes(pai)),
  }
}
