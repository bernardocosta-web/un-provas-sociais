import http from 'node:http'

// Servidor HTTP local (127.0.0.1, porta livre escolhida pelo sistema) para
// fazer papel de servico externo nos testes do backup. Nada sai da maquina.
// `tratar(req, corpo: Buffer, res)` responde; toda requisicao fica gravada.
export async function subirServidor(tratar) {
  const requisicoes = []
  const servidor = http.createServer((req, res) => {
    const partes = []
    req.on('data', (p) => partes.push(p))
    req.on('end', async () => {
      const corpo = Buffer.concat(partes)
      const url = new URL(req.url, 'http://127.0.0.1')
      requisicoes.push({ momento: process.hrtime.bigint(), metodo: req.method, caminho: url.pathname,
        busca: url.searchParams, cabecalhos: req.headers, corpo })
      try {
        await tratar(req, corpo, res, url)
      } catch (erro) {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end(String(erro?.stack ?? erro))
      }
    })
  })
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  const { port } = servidor.address()
  return {
    url: `http://127.0.0.1:${port}`,
    requisicoes,
    fechar: () => new Promise((ok) => {
      servidor.closeAllConnections?.()
      servidor.close(() => ok())
    }),
  }
}

export function responderJson(res, status, objeto, cabecalhos = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...cabecalhos })
  res.end(JSON.stringify(objeto))
}
