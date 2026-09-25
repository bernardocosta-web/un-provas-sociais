import { ErroBackup } from './erros.js'

// Supabase por fetch, com a chave de servico: Storage API (listar e baixar
// os objetos dos buckets) e o ping anti-pausa pela API REST. A chave vai em
// `apikey` e em `Authorization`, como o supabase-js faz; serve a legada
// (JWT service_role) e a nova (sb_secret_...).

const caminhoUrl = (caminho) => caminho.split('/').map(encodeURIComponent).join('/')

export function criarClienteSupabase({ url, chaveServico, fetch = globalThis.fetch, tamanhoPagina = 1000 }) {
  const cabecalhos = { apikey: chaveServico, Authorization: `Bearer ${chaveServico}` }

  async function chamar(etapa, endereco, opcoes = {}) {
    let resposta
    try {
      resposta = await fetch(endereco, {
        ...opcoes, headers: { ...cabecalhos, ...opcoes.headers }, signal: AbortSignal.timeout(120_000),
      })
    } catch (causa) {
      throw new ErroBackup(`Supabase sem resposta (${etapa}): ${causa.message}`, { etapa, causa })
    }
    return resposta
  }

  const detalhe = async (resposta) => (await resposta.text().catch(() => '')).slice(0, 300)

  async function listarPasta(bucket, pasta) {
    // Ate uma pagina VAZIA: o servidor pode cortar a pagina abaixo do limite
    // pedido, e "pagina curta = fim" perderia objetos em silencio.
    const itens = []
    for (let offset = 0; ;) {
      const resposta = await chamar('Storage', `${url}/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: pasta, limit: tamanhoPagina, offset,
          sortBy: { column: 'name', order: 'asc' } }),
      })
      if (!resposta.ok) {
        throw new ErroBackup(`Storage recusou a listagem de "${bucket}/${pasta}": HTTP ${resposta.status} ` +
          `${await detalhe(resposta)}. Confira SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.`, { etapa: 'Storage' })
      }
      const pagina = await resposta.json()
      if (pagina.length === 0) return itens
      itens.push(...pagina)
      offset += pagina.length
    }
  }

  return {
    // Todos os objetos do bucket sob `prefixo` (recursivo). Item sem id e
    // pasta. `versao` muda quando o objeto e sobrescrito.
    async listar(bucket, prefixo = '') {
      const objetos = []
      const pendentes = [prefixo]
      while (pendentes.length) {
        const pasta = pendentes.shift()
        for (const item of await listarPasta(bucket, pasta)) {
          const caminho = pasta ? `${pasta}/${item.name}` : item.name
          if (!item.id) {
            pendentes.push(caminho)
            continue
          }
          objetos.push({
            caminho,
            versao: [item.updated_at, item.metadata?.eTag, item.version].filter(Boolean).join('|'),
            tamanho: item.metadata?.size ?? 0,
            tipo: item.metadata?.mimetype || 'application/octet-stream',
          })
        }
      }
      return objetos
    },

    async baixar(bucket, caminho) {
      const resposta = await chamar('Storage',
        `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${caminhoUrl(caminho)}`)
      if (!resposta.ok) {
        throw new ErroBackup(`Storage nao entregou "${bucket}/${caminho}": HTTP ${resposta.status} ` +
          `${await detalhe(resposta)}`, { etapa: 'Storage' })
      }
      return Buffer.from(await resposta.arrayBuffer())
    },

    // O criterio de inatividade do Supabase nao diz se conta conexao de banco
    // ou requisicao de API: o dump cobre a primeira, este GET a segunda.
    // curso nao tem dado pessoal; o grant e da 0017_ping_backup.sql.
    async pingAntiPausa() {
      const resposta = await chamar('ping anti-pausa', `${url}/rest/v1/curso?select=id&limit=1`)
      if (!resposta.ok) {
        throw new ErroBackup(`Ping anti-pausa (GET /rest/v1/curso) falhou: HTTP ${resposta.status} ` +
          `${await detalhe(resposta)}. Confira SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e se a migracao ` +
          '0017_ping_backup.sql (grant select em curso para service_role) foi aplicada.',
        { etapa: 'ping anti-pausa' })
      }
      await resposta.arrayBuffer()
    },
  }
}
