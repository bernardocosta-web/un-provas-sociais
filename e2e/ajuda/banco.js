// Conferências no banco local (pg como superusuário), para afirmar o que a
// tela não mostra: quantos registros, qual aluno_id, que arquivos há no bucket.
import { conectar } from '../../testes/rls/ajuda.js'

export async function consultar(sql, parametros = []) {
  const cliente = await conectar()
  try {
    return (await cliente.query(sql, parametros)).rows
  } finally {
    await cliente.end()
  }
}

export async function arquivosNoBucket(bucket) {
  const linhas = await consultar(
    'select name from storage.objects where bucket_id = $1 order by name', [bucket])
  return linhas.map((l) => l.name)
}

export async function instituicaoPorNome(nome) {
  const [linha] = await consultar(
    `select i.id, i.logo_path,
            coalesce(array_agg(a.apelido order by a.apelido) filter (where a.apelido is not null), '{}') as apelidos
       from instituicao i left join instituicao_apelido a on a.instituicao_id = i.id
      where i.nome_canonico = $1 group by i.id`, [nome])
  return linha ?? null
}

export async function depoimentosComTexto(texto) {
  return consultar('select * from depoimento where texto_completo = $1 order by id', [texto])
}
