// Regras do formulario da ficha (Task 20). Logica pura: sem Vue, sem
// supabase-js. As funcoes mudar*/aplicar* alteram o objeto recebido (o
// reactive da ficha) de proposito: varios campos mudam na mesma operacao.
import { normalizar } from './instituicoes.js'

// Spec 6.2: "Escolhida a prova ENEM, a escala vem TRI."
export function escalaPadrao(prova) {
  if (!prova) return ''
  return normalizar(prova.nome) === 'enem' ? 'TRI' : 'PERCENTUAL'
}

// So preenche a escala das notas que ainda nao tem: a que a pessoa ja
// escolheu nunca e sobrescrita.
export function aplicarProva(participacao, prova) {
  participacao.prova_id = prova?.id ?? ''
  if (!prova) return
  for (const nota of participacao.notas) {
    if (!nota.escala) nota.escala = escalaPadrao(prova)
  }
}

// Branco = '' (contrato de validacao.js/ficha.js). Sem `id`: salvar insere.
export function novaFicha() {
  return {
    texto_completo: '', resumo_curto: '', autor_bruto: '', autor_contato_bruto: '',
    fonte: '', link_original: '', data_depoimento: '', print_path: '', aluno_id: '',
    autorizacao_publicacao: 'NAO_INFORMADO', status_uso: 'DISPONIVEL',
    data_postagem: '', link_post: '', motivo_descarte: '', observacao_descarte: '',
    tipos: [], canais: [], participacoes: [],
  }
}

export function novaParticipacao() {
  return { prova_id: '', ano: '', notas: [], resultados: [] }
}

export function novaNota(prova) {
  return { materia_id: '', valor_original: '', escala: escalaPadrao(prova), valor_maximo: '' }
}

export function novoResultado() {
  return { instituicao_id: '', curso_id: '', situacao: '' }
}

// ck_autorizacao (0006): sem autorizacao, so descartado por falta dela.
// Status e motivo mudam juntos, senao o banco recusa.
export function mudarAutorizacao(ficha, valor) {
  ficha.autorizacao_publicacao = valor
  if (valor === 'NAO_AUTORIZADO') {
    ficha.status_uso = 'DESCARTADO'
    ficha.motivo_descarte = 'SEM_AUTORIZACAO'
  }
}

// ck_descarte_motivo/ck_descarte_observacao: reverter um descarte limpa o
// motivo e a observacao, que nao podem sobrar num depoimento ativo.
export function mudarStatus(ficha, valor) {
  ficha.status_uso = valor
  if (valor !== 'DESCARTADO') {
    ficha.motivo_descarte = ''
    ficha.observacao_descarte = ''
  }
}
