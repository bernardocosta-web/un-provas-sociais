import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import {
  CONTEINER_PADRAO, conferirConteiner, nomeDoBancoDeEnsaio, criarBanco, apagarBanco, restaurar, consultarJson,
} from './banco.js'
import { classificarErros, compararArquivos, veredito } from './analise.js'

// Ensaio de restauracao: um backup baixado do Drive (dump .sql.gz + pasta com
// prints/ e logos/) vai para um banco NOVO e descartavel da stack local; as
// conferencias viram um relatorio. Runbook: docs/runbook-backup.md.

const BUCKETS = ['prints', 'logos']

const SQL_CONTAGENS = `
  select coalesce(json_object_agg(table_name, n order by table_name), '{}')
  from (
    select table_name,
      (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name),
        false, true, '')))[1]::text::bigint as n
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  ) t`

// Amostra: prefere o depoimento com a cadeia completa (nota e resultado),
// depois o com mais participacoes, depois o mais recente.
const SQL_AMOSTRA = `
  select coalesce((select row_to_json(x) from (
    select d.id, left(d.texto_completo, 60) as texto,
      count(distinct p.id) as participacoes, count(distinct n.id) as notas, count(distinct r.id) as resultados
    from public.depoimento d
    left join public.participacao p on p.depoimento_id = d.id
    left join public.nota n on n.participacao_id = p.id
    left join public.resultado r on r.participacao_id = p.id
    group by d.id
    order by (count(distinct n.id) > 0 and count(distinct r.id) > 0) desc, count(distinct p.id) desc, d.id desc
    limit 1) x), 'null')`

const SQL_METADADOS = `
  select coalesce(json_agg(json_build_object('bucket', bucket_id, 'caminho', name) order by bucket_id, name), '[]')
  from storage.objects where bucket_id in ('prints', 'logos')`

const SQL_PRINTS = `
  select coalesce(json_agg(distinct print_path), '[]') from public.depoimento where print_path is not null`

function listarArquivos(pasta) {
  const achados = []
  for (const bucket of BUCKETS) {
    const raiz = path.join(pasta, bucket)
    if (!existsSync(raiz)) continue
    const pendentes = ['']
    while (pendentes.length) {
      const rel = pendentes.pop()
      for (const nome of readdirSync(path.join(raiz, rel))) {
        const relNome = rel ? `${rel}/${nome}` : nome
        if (statSync(path.join(raiz, relNome)).isDirectory()) pendentes.push(relNome)
        else achados.push({ bucket, caminho: relNome })
      }
    }
  }
  return achados
}

// prefixo: restringe a conferencia de arquivos a caminhos que comecam com ele
// (os testes usam, porque os buckets locais sao compartilhados por varias
// suites). No ensaio de verdade, fica vazio.
export async function executarEnsaio({
  dump, arquivos, manter = false, conteiner = CONTEINER_PADRAO, prefixo = '', registrar = () => {},
}) {
  if (!existsSync(dump) || !dump.endsWith('.sql.gz')) {
    throw new Error(`Dump nao encontrado ou nao e .sql.gz: ${dump}`)
  }
  if (!existsSync(arquivos)) throw new Error(`Pasta de arquivos nao encontrada: ${arquivos}`)
  conferirConteiner(conteiner)

  const banco = nomeDoBancoDeEnsaio()
  registrar(`criando o banco de ensaio ${banco} ...`)
  criarBanco(conteiner, banco)
  try {
    registrar('restaurando o dump (leva alguns segundos) ...')
    const erros = classificarErros(await restaurar(conteiner, banco, dump))
    const contagens = consultarJson(conteiner, banco, SQL_CONTAGENS)
    const membrosAtivos = contagens.membro_equipe === undefined ? 0
      : consultarJson(conteiner, banco, 'select count(*) from public.membro_equipe where ativo')
    const temDepoimento = contagens.depoimento !== undefined
    const amostra = temDepoimento ? consultarJson(conteiner, banco, SQL_AMOSTRA) : null
    const noPrefixo = (c) => c.startsWith(prefixo)
    const metadados = consultarJson(conteiner, banco, SQL_METADADOS).filter((m) => noPrefixo(m.caminho))
    const noDisco = listarArquivos(arquivos).filter((a) => noPrefixo(a.caminho))
    const prints = new Set(noDisco.filter((a) => a.bucket === 'prints').map((a) => a.caminho))
    const printsSemArquivo = (temDepoimento ? consultarJson(conteiner, banco, SQL_PRINTS) : [])
      .filter((p) => noPrefixo(p) && !prints.has(p) && !prints.has(p.replaceAll('/', '_')))

    const dados = {
      banco, dump: path.basename(dump), mantido: manter, erros, contagens, membrosAtivos, amostra,
      arquivos: compararArquivos(metadados, noDisco), printsSemArquivo,
    }
    dados.veredito = veredito(dados)
    return dados
  } finally {
    if (!manter) apagarBanco(conteiner, banco)
  }
}
