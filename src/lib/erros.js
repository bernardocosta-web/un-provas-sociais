// Erros de RPC/PostgREST chegam com o SQLSTATE do Postgres em `code`
// (supabase-js repassa isso do corpo do erro). Traduz os casos comuns para
// pt-BR; o resto usa a mensagem original — as nossas próprias funções (ex.:
// mesclar_instituicoes, código P0001, o padrão de `raise exception` sem
// `using errcode`) já levantam mensagens em português, e não têm entrada
// aqui de propósito: mapear P0001 pisaria em cima delas.
const MENSAGENS_POR_CODIGO = {
  // unique_violation: nome_canonico ou apelido já usados por outro cadastro
  // (instituicao_apelido.apelido é único globalmente; instituicao.nome_canonico
  // também). O Postgres não diz em português qual coluna colidiu.
  23505: 'Já existe um cadastro com esse nome ou apelido.',
  // insufficient_privilege: RLS negou a linha (quem chama não está em
  // membro_equipe, ou está inativo). Mesmo texto da mensagem de RLS do
  // Storage abaixo, que chega sem `code`.
  42501: 'Sem permissão: este e-mail não está na lista da equipe.',
  // check_violation: hoje só ck_*_nome (btrim(nome) <> ''); mensagem
  // pensada para o caso comum (nome/nome_canonico em branco).
  23514: 'Preencha o nome.',
  // not_null_violation: campo obrigatório ausente do payload.
  23502: 'Campo obrigatório em branco.',
  // foreign_key_violation: rede de segurança de remover_instituicao/
  // remover_cadastro_simples (0014) contra uma corrida (uso inserido entre a
  // contagem e o delete) que a trava (SELECT ... FOR UPDATE) não pegou —
  // hoje só alcançável em teoria, não observada em teste.
  23503: 'Não foi possível remover: o cadastro está em uso.',
}

const MENSAGEM_RLS_STORAGE = 'Sem permissão: este e-mail não está na lista da equipe.'
const MENSAGEM_DECODE_IMAGEM = 'Não foi possível ler a imagem; use PNG, JPG ou WebP.'

// A resposta da Storage API para uma política de RLS negada não vem com
// `code` (diferente do PostgREST/RPC) — só a mensagem crua do Postgres.
const PADRAO_RLS_STORAGE = /row-level security policy/i

// createImageBitmap() rejeita com DOMException ao não conseguir decodificar
// a imagem; o nome varia por navegador (InvalidStateError, EncodingError),
// e a mensagem menciona "decode"/"decoded" nos dois casos observados.
const NOMES_ERRO_DECODE_IMAGEM = new Set(['InvalidStateError', 'EncodingError'])
const PADRAO_DECODE_IMAGEM = /decod/i

export function mensagemDeErro(erro) {
  const codigo = erro?.code
  if (codigo && MENSAGENS_POR_CODIGO[codigo]) return MENSAGENS_POR_CODIGO[codigo]

  const mensagem = erro?.message ?? String(erro)
  if (PADRAO_RLS_STORAGE.test(mensagem)) return MENSAGEM_RLS_STORAGE
  if (NOMES_ERRO_DECODE_IMAGEM.has(erro?.name) || PADRAO_DECODE_IMAGEM.test(mensagem)) {
    return MENSAGEM_DECODE_IMAGEM
  }
  return mensagem
}
