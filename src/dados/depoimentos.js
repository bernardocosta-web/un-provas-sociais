import { supabase } from './cliente.js'
import { validarDepoimento } from '../lib/validacao.js'
import { prepararFicha } from '../lib/ficha.js'

// Valida a ficha como o formulario a tem (strings, brancos) e so depois a
// prepara para o banco: branco vira null, numero de formulario vira Number,
// valor_maximo fora de PONTOS vira null (prepararFicha, src/lib/ficha.js).
// salvar_depoimento repete o nullif(btrim(...), '') como defesa em
// profundidade.
export async function salvarDepoimento(ficha) {
  const erros = validarDepoimento(ficha)
  if (erros.length) throw new Error(erros.join('\n'))
  const { data, error } = await supabase.rpc('salvar_depoimento', {
    p_ficha: prepararFicha(ficha),
  })
  if (error) throw error
  return data
}

// So as colunas que a ficha usa (as que salvar_depoimento le, mais os ids e
// o percentual gerado para exibir) — sem criado_em/atualizado_em.
const COLUNAS_FICHA = `id, texto_completo, resumo_curto, autor_bruto, autor_contato_bruto,
  fonte, link_original, data_depoimento, print_path, aluno_id,
  autorizacao_publicacao, status_uso, data_postagem, link_post,
  motivo_descarte, observacao_descarte,
  depoimento_tipo(tipo), depoimento_canal(canal),
  participacao(id, prova_id, ano,
    nota(id, materia_id, valor_original, escala, valor_maximo, percentual),
    resultado(id, instituicao_id, curso_id, situacao))`

// Filhos ordenados por id: sem isso a ficha pode reordenar ao recarregar.
// maybeSingle: id inexistente (ou invisivel pela RLS) vira data null, e o
// erro sai em pt-BR em vez do PGRST116 cru do .single().
export async function carregarDepoimento(id) {
  const { data, error } = await supabase
    .from('depoimento')
    .select(COLUNAS_FICHA)
    .eq('id', id)
    .order('id', { referencedTable: 'participacao' })
    .order('id', { referencedTable: 'participacao.nota' })
    .order('id', { referencedTable: 'participacao.resultado' })
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Depoimento não encontrado.')
  const { depoimento_tipo, depoimento_canal, participacao, ...campos } = data
  return {
    ...campos,
    tipos: (depoimento_tipo ?? []).map((t) => t.tipo),
    canais: (depoimento_canal ?? []).map((c) => c.canal),
    participacoes: (participacao ?? []).map(({ nota, resultado, ...p }) => ({
      ...p, notas: nota ?? [], resultados: resultado ?? [],
    })),
  }
}

export async function buscarDepoimentos(filtros) {
  const { data, error } = await supabase.rpc('buscar_depoimentos', { p_filtros: filtros })
  if (error) throw error
  return data
}

// upsert: false — mesmo motivo do enviarLogo (Task 17): sem politica de
// UPDATE no bucket, upsert: true cairia no caminho negado quando o nome ja
// existisse. nomeArquivo precisa ser unico por envio; a remocao do print
// antigo e responsabilidade de quem chama, depois de salvar a referencia nova.
export async function enviarPrint(arquivo, nomeArquivo) {
  const { error } = await supabase.storage.from('prints').upload(nomeArquivo, arquivo, {
    upsert: false, contentType: 'image/webp',
  })
  if (error) throw error
  return nomeArquivo
}

// Troca/descarte de print: apaga um arquivo do bucket prints (o antigo depois
// de salvar a referencia nova, ou o novo quando salvar falhou — Task 20).
export async function removerPrint(caminho) {
  const { error } = await supabase.storage.from('prints').remove([caminho])
  if (error) throw error
}

export async function urlAssinadaDoPrint(caminho, segundos = 3600) {
  const { data, error } = await supabase.storage
    .from('prints').createSignedUrl(caminho, segundos)
  if (error) throw error
  return data.signedUrl
}
