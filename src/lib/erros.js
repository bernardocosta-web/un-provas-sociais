import { STATUS } from './rotulos.js'

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
  // not_null_violation: campo obrigatório ausente do payload.
  23502: 'Campo obrigatório em branco.',
  // foreign_key_violation: rede de segurança de remover_instituicao/
  // remover_cadastro_simples (0014) contra uma corrida (uso inserido entre a
  // contagem e o delete) que a trava (SELECT ... FOR UPDATE) não pegou —
  // hoje só alcançável em teoria, não observada em teste.
  23503: 'Não foi possível remover: o cadastro está em uso.',
}

// check_violation (23514) é traduzido pelo NOME da constraint, que o
// Postgres põe na mensagem ('... violates check constraint "ck_x"'). Os
// textos batem com os de validacao.js: a pessoa lê a mesma coisa, venha o
// erro da validação do formulário ou do banco. 'Preencha o nome.' fica só
// para os checks de nome em branco; constraint sem entrada aqui (ou erro sem
// o nome na mensagem) cai na mensagem genérica.
export const MENSAGEM_NOME_EM_BRANCO = 'Preencha o nome.'
const MENSAGEM_CHECK_GENERICA = 'Algum dado não obedece às regras do cadastro.'
const MENSAGENS_POR_CHECK = {
  // 0003/0006: nomes de cadastro em branco
  ck_instituicao_nome: MENSAGEM_NOME_EM_BRANCO,
  ck_apelido: MENSAGEM_NOME_EM_BRANCO,
  ck_prova_nome: MENSAGEM_NOME_EM_BRANCO,
  ck_curso_nome: MENSAGEM_NOME_EM_BRANCO,
  ck_materia_nome: MENSAGEM_NOME_EM_BRANCO,
  ck_aluno_nome: MENSAGEM_NOME_EM_BRANCO,
  // 0006: depoimento
  ck_texto_nao_vazio: 'O texto completo é obrigatório.',
  // Vale nos dois sentidos (descartado sem motivo, ou motivo sem descarte);
  // o banco não diz qual, então a mensagem cobre os dois.
  ck_descarte_motivo:
    'Depoimento descartado precisa de motivo, e motivo de descarte só vale para depoimento descartado.',
  ck_descarte_observacao: 'Observação de descarte só vale para depoimento descartado.',
  ck_motivo_outro: 'Motivo "outro" precisa de observação.',
  ck_postado_data: 'Depoimento postado precisa da data da postagem.',
  ck_autorizacao:
    'Depoimento sem autorização só pode ficar descartado por falta de autorização.',
  // 0007: participacao, nota, resultado
  ck_ano: 'O ano da participação precisa estar entre 1990 e 2100.',
  ck_pontos_exige_maximo: 'Nota em pontos precisa do valor máximo.',
  ck_nota_nao_negativa: 'O valor da nota não pode ser negativo.',
  ck_percentual_ate_100: 'Nota em percentual não pode passar de 100.',
  ck_pontos_ate_maximo: 'Nota em pontos não pode passar do valor máximo.',
  ck_tri_faixa: 'Nota do TRI precisa estar entre 0 e 1000.',
  ck_aprovado_exige_instituicao: 'Resultado aprovado precisa de instituição.',
}
const PADRAO_NOME_CHECK = /check constraint "([^"]+)"/

// valida_transicao_status (0008) também usa check_violation, mas sem nome de
// constraint: 'transicao de status invalida: DISPONIVEL -> FEITO'.
const PADRAO_TRANSICAO = /transicao de status invalida: (\w+) -> (\w+)/
// Os mesmos rotulos do select de status da ficha (rotulos.js).
const ROTULOS_STATUS = Object.fromEntries(STATUS.map((s) => [s.valor, s.rotulo]))
const rotuloStatus = (status) => ROTULOS_STATUS[status] ?? status

function mensagemDeCheck(mensagem) {
  const transicao = PADRAO_TRANSICAO.exec(mensagem ?? '')
  if (transicao) {
    const [, de, para] = transicao
    return `Não é possível mudar o status de "${rotuloStatus(de)}" para "${rotuloStatus(para)}".`
  }
  const nome = PADRAO_NOME_CHECK.exec(mensagem ?? '')?.[1]
  return (nome && Object.hasOwn(MENSAGENS_POR_CHECK, nome) && MENSAGENS_POR_CHECK[nome])
    || MENSAGEM_CHECK_GENERICA
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
  if (String(codigo) === '23514') return mensagemDeCheck(erro?.message)
  if (codigo && MENSAGENS_POR_CODIGO[codigo]) return MENSAGENS_POR_CODIGO[codigo]

  const mensagem = erro?.message ?? String(erro)
  if (PADRAO_RLS_STORAGE.test(mensagem)) return MENSAGEM_RLS_STORAGE
  if (NOMES_ERRO_DECODE_IMAGEM.has(erro?.name) || PADRAO_DECODE_IMAGEM.test(mensagem)) {
    return MENSAGEM_DECODE_IMAGEM
  }
  return mensagem
}
