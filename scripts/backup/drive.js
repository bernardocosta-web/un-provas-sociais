import { ErroBackup } from './erros.js'

// Cliente minimo da Google Drive API v3 por fetch (sem googleapis): so as
// operacoes que o backup usa. Upload sempre resumable (duas
// requisicoes), que nao tem o teto de 5 MB do multipart. supportsAllDrives
// em tudo, para a Rota A (Drive compartilhado) funcionar sem mudar codigo.

const PASTA = 'application/vnd.google-apps.folder'
const CAMPOS_LISTA = 'nextPageToken,files(id,name,mimeType,createdTime,appProperties)'

export class ErroDrive extends ErroBackup {
  constructor(operacao, status, motivo, detalhe) {
    super(`Drive respondeu ${status}${motivo ? ` (${motivo})` : ''} em ${operacao}` +
      `${detalhe ? `: ${detalhe}` : ''}`, { etapa: 'Google Drive' })
    this.name = 'ErroDrive'
    this.status = status
    this.motivo = motivo
  }
}

const aspas = (texto) => `'${String(texto).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

export function criarClienteDrive({
  obterToken, urlApi = 'https://www.googleapis.com', fetch = globalThis.fetch,
  tamanhoPagina = 1000, tentativas = 3,
  esperar = (ms) => new Promise((ok) => setTimeout(ok, ms)),
}) {
  // aceitar404: operacao idempotente (apagar/lixeira) repetida depois de um
  // 5xx que na verdade ja tinha sido aplicado — o arquivo ja nao esta la.
  async function chamar(operacao, url, opcoes = {}, { json = true, aceitar404 = false } = {}) {
    for (let tentativa = 1; ; tentativa++) {
      const token = await obterToken()
      let resposta
      try {
        resposta = await fetch(url, {
          ...opcoes,
          headers: { Authorization: `Bearer ${token}`, ...opcoes.headers },
          signal: AbortSignal.timeout(300_000),
        })
      } catch (causa) {
        if (tentativa < tentativas) { await esperar(1000 * tentativa); continue }
        throw new ErroDrive(operacao, 'sem resposta', null, causa.message)
      }
      if (resposta.ok) return json ? resposta.json() : resposta
      if (aceitar404 && resposta.status === 404) return null
      const corpo = await resposta.json().catch(() => null)
      const transitorio = resposta.status === 429 || resposta.status >= 500
      if (transitorio && tentativa < tentativas) { await esperar(1000 * tentativa); continue }
      throw new ErroDrive(operacao, resposta.status, corpo?.error?.errors?.[0]?.reason,
        corpo?.error?.message)
    }
  }

  const arquivos = `${urlApi}/drive/v3/files`

  return {
    obterArquivo(id) {
      const busca = new URLSearchParams({ fields: 'id,name,mimeType,trashed', supportsAllDrives: 'true' })
      return chamar('files.get', `${arquivos}/${encodeURIComponent(id)}?${busca}`)
    },

    async listar({ pai, propriedades = {} }) {
      const q = [`${aspas(pai)} in parents`, 'trashed = false',
        ...Object.entries(propriedades).map(([k, v]) =>
          `appProperties has { key=${aspas(k)} and value=${aspas(v)} }`)].join(' and ')
      const todos = []
      let pageToken
      do {
        const busca = new URLSearchParams({ q, fields: CAMPOS_LISTA, pageSize: String(tamanhoPagina),
          supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', ...(pageToken ? { pageToken } : {}) })
        const pagina = await chamar('files.list', `${arquivos}?${busca}`)
        todos.push(...(pagina.files ?? []))
        pageToken = pagina.nextPageToken
      } while (pageToken)
      return todos
    },

    criarPasta({ nome, pai, propriedades = {} }) {
      return chamar('files.create (pasta)', `${arquivos}?supportsAllDrives=true&fields=id,name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nome, mimeType: PASTA, parents: [pai], appProperties: propriedades }),
      })
    },

    async enviar({ nome, pai, conteudo, mimeType, propriedades = {} }) {
      const inicio = await chamar('upload (inicio)',
        `${urlApi}/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Type': mimeType,
            'X-Upload-Content-Length': String(conteudo.length),
          },
          body: JSON.stringify({ name: nome, mimeType, parents: [pai], appProperties: propriedades }),
        }, { json: false })
      const sessao = inicio.headers.get('location')
      if (!sessao) throw new ErroDrive('upload (inicio)', inicio.status, null, 'sem cabecalho Location')
      return chamar('upload (conteudo)', sessao, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: conteudo,
      })
    },

    async apagar(id) {
      await chamar('files.delete', `${arquivos}/${encodeURIComponent(id)}?supportsAllDrives=true`,
        { method: 'DELETE' }, { json: false, aceitar404: true })
    },

    // A retencao usa a lixeira, nao o apagar: o Drive guarda por 30 dias, e
    // um erro na regra ainda tem volta.
    async moverParaLixeira(id) {
      await chamar('files.update (lixeira)', `${arquivos}/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true }),
      }, { json: false, aceitar404: true })
    },
  }
}
