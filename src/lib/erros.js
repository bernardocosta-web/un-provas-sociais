// Erros de RPC/PostgREST chegam com o SQLSTATE do Postgres em `code`
// (supabase-js repassa isso do corpo do erro). Traduz os casos comuns para
// pt-BR; o resto usa a mensagem original — as nossas próprias funções (ex.:
// mesclar_instituicoes) já levantam mensagens em português.
const MENSAGENS_POR_CODIGO = {
  // unique_violation: nome_canonico ou apelido já usados por outro cadastro
  // (instituicao_apelido.apelido é único globalmente; instituicao.nome_canonico
  // também). O Postgres não diz em português qual coluna colidiu.
  23505: 'Já existe um cadastro com esse nome ou apelido.',
}

export function mensagemDeErro(erro) {
  const codigo = erro?.code
  if (codigo && MENSAGENS_POR_CODIGO[codigo]) return MENSAGENS_POR_CODIGO[codigo]
  return erro?.message ?? String(erro)
}
