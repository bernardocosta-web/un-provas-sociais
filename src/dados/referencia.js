import { supabase } from './cliente.js'

export async function listarInstituicoes() {
  const { data, error } = await supabase
    .from('instituicao')
    .select('id, nome_canonico, logo_path, ativo, instituicao_apelido(apelido)')
    .order('nome_canonico')
  if (error) throw error
  return data.map((i) => ({
    ...i,
    apelidos: (i.instituicao_apelido ?? []).map((a) => a.apelido),
  }))
}

// Grava a instituicao e substitui seus apelidos numa unica chamada RPC
// (salvar_instituicao, 0012), que faz tudo numa transacao so. Sem isso, tres
// chamadas separadas (update instituicao -> delete apelidos -> insert
// apelidos) deixavam uma janela: um apelido colidindo com o de outra
// instituicao (apelido e unico globalmente) so falhava na insercao, DEPOIS
// de logo_path ja ter sido trocado — a instituicao ficava com uma logo nova
// e nenhum apelido. `id` ausente insere (e `generated always`, nunca vai no
// payload); presente, atualiza.
export async function salvarInstituicao({ id, nome_canonico, logo_path, apelidos }) {
  const { data, error } = await supabase.rpc('salvar_instituicao', {
    p_dados: { id: id ?? null, nome_canonico, logo_path: logo_path ?? null, apelidos: apelidos ?? [] },
  })
  if (error) throw error
  return data
}

// A funcao devolve o logo_path da perdedora; o arquivo so e removido do
// bucket depois de a mesclagem confirmar (SQL nao pode apagar de
// storage.objects — so a Storage API). Falha nessa remocao nao desfaz a
// mesclagem, que ja valeu: deixa um arquivo orfao no bucket, e so.
export async function mesclarInstituicoes(idVencedor, idPerdedor) {
  const { data: logoPerdedor, error } = await supabase.rpc('mesclar_instituicoes', {
    p_vencedor: idVencedor, p_perdedor: idPerdedor,
  })
  if (error) throw error
  if (logoPerdedor) {
    const { error: erroRemocao } = await supabase.storage.from('logos').remove([logoPerdedor])
    if (erroRemocao) console.warn('Logo da instituição mesclada ficou no bucket:', erroRemocao.message)
  }
}

// upsert: false — o bucket nao tem politica de UPDATE (decisao do dono); um
// nome ja existente tem de ser negado, nunca sobrescrito. nomeArquivo precisa
// ser unico por envio (ver emenda no cabecalho desta tarefa); a substituicao
// de uma logo antiga e responsabilidade de quem chama (gravar a referencia
// nova antes de remover o arquivo antigo).
//
// Devolve o CAMINHO (nomeArquivo), nao a URL: e o caminho que vai para
// instituicao.logo_path, e so com ele `remove([antigo])` funciona. A URL
// publica e derivada na hora de renderizar (urlDaLogo).
export async function enviarLogo(arquivo, nomeArquivo) {
  const { error } = await supabase.storage.from('logos').upload(nomeArquivo, arquivo, {
    upsert: false, contentType: 'image/webp',
  })
  if (error) throw error
  return nomeArquivo
}

export async function removerLogo(caminho) {
  const { error } = await supabase.storage.from('logos').remove([caminho])
  if (error) throw error
}

export function urlDaLogo(caminho) {
  if (!caminho) return null
  return supabase.storage.from('logos').getPublicUrl(caminho).data.publicUrl
}

export async function listarSimples(tabela) {
  const { data, error } = await supabase.from(tabela).select('id, nome').order('nome')
  if (error) throw error
  return data
}

export async function criarSimples(tabela, nome) {
  const { data, error } = await supabase
    .from(tabela).insert({ nome }).select('id, nome').single()
  if (error) throw error
  return data
}

// Prova nao e "simples" para leitura: tem instituicao opcional (nula para o
// ENEM), e listarSimples so devolve id/nome. O nome da instituicao vem junto
// para a aba de Provas nao precisar de uma segunda consulta por linha.
export async function listarProvas() {
  const { data, error } = await supabase
    .from('prova')
    .select('id, nome, instituicao_id, instituicao(nome_canonico)')
    .order('nome')
  if (error) throw error
  return data.map((p) => ({
    id: p.id,
    nome: p.nome,
    instituicao_id: p.instituicao_id,
    instituicao_nome: p.instituicao?.nome_canonico ?? null,
  }))
}

export async function criarProva({ nome, instituicao_id }) {
  const { data, error } = await supabase
    .from('prova')
    .insert({ nome, instituicao_id: instituicao_id ?? null })
    .select('id, nome, instituicao_id')
    .single()
  if (error) throw error
  return data
}

// Instituicao nao e "simples": a coluna e nome_canonico, nao nome. Usado pelo
// combobox da ficha (Task 20) para criar na hora.
export async function criarInstituicao(nome_canonico) {
  const { data, error } = await supabase
    .from('instituicao').insert({ nome_canonico })
    .select('id, nome_canonico, ativo').single()
  if (error) throw error
  return { ...data, apelidos: [] }
}
