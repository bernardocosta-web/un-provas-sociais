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

export async function carregarDepoimento(id) {
  const { data, error } = await supabase
    .from('depoimento')
    .select(`*, depoimento_tipo(tipo), depoimento_canal(canal),
             participacao(id, prova_id, ano,
               nota(id, materia_id, valor_original, escala, valor_maximo, percentual),
               resultado(id, instituicao_id, curso_id, situacao))`)
    .eq('id', id)
    .single()
  if (error) throw error
  return {
    ...data,
    tipos: (data.depoimento_tipo ?? []).map((t) => t.tipo),
    canais: (data.depoimento_canal ?? []).map((c) => c.canal),
    participacoes: (data.participacao ?? []).map((p) => ({
      ...p, notas: p.nota ?? [], resultados: p.resultado ?? [],
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
