import { URL_API } from '../../local.js'
import { obterChaveServico } from '../../auth/ajuda.js'
import { conectar } from '../../rls/ajuda.js'

// Semeia e limpa objetos nos buckets da stack LOCAL pela Storage API, com a
// chave de servico local (so fixture). Tudo sob um prefixo-marcador, para
// nao tocar em nada de outro teste.

const cabecalhos = () => {
  const chave = obterChaveServico()
  return { apikey: chave, Authorization: `Bearer ${chave}` }
}

export async function subirObjeto(bucket, caminho, conteudo, tipo = 'image/png') {
  const resposta = await fetch(`${URL_API}/storage/v1/object/${bucket}/${caminho}`, {
    method: 'POST', headers: { ...cabecalhos(), 'Content-Type': tipo }, body: conteudo,
  })
  if (!resposta.ok) throw new Error(`upload ${bucket}/${caminho}: ${resposta.status} ${await resposta.text()}`)
}

// Apaga pela Storage API (arquivo e linha) tudo sob o prefixo nos dois
// buckets; devolve quantas linhas de storage.objects ainda casam (tem de ser 0).
export async function limparPrefixo(prefixo) {
  const c = await conectar()
  try {
    const { rows } = await c.query(
      'select bucket_id, name from storage.objects where name like $1', [`${prefixo}%`])
    for (const bucket of ['prints', 'logos']) {
      const nomes = rows.filter((r) => r.bucket_id === bucket).map((r) => r.name)
      if (!nomes.length) continue
      const resposta = await fetch(`${URL_API}/storage/v1/object/${bucket}`, {
        method: 'DELETE', headers: { ...cabecalhos(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: nomes }),
      })
      if (!resposta.ok) throw new Error(`limpeza ${bucket}: ${resposta.status} ${await resposta.text()}`)
    }
    const sobra = await c.query(
      'select count(*)::int as n from storage.objects where name like $1', [`${prefixo}%`])
    return sobra.rows[0].n
  } finally {
    await c.end()
  }
}
