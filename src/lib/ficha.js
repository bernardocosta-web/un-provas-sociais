// Prepara a ficha do formulario para salvar_depoimento (Task 19). Logica
// pura: sem Vue, sem supabase-js. Nao altera o objeto recebido.
//
// Contrato de branco: o formulario manda '' para campo limpo ou nunca
// preenchido, e a validacao (validacao.js) trata branco como ausente. Aqui
// o branco vira NULL de verdade, e os numeros de formulario viram Number
// pela mesma conversao da validacao (numero.js). O SQL repete o
// nullif(btrim(...), '') como defesa em profundidade.

import { numeroOuNulo } from './numero.js'

const TEXTOS_OPCIONAIS = [
  'resumo_curto', 'autor_bruto', 'autor_contato_bruto', 'link_original',
  'print_path', 'link_post', 'observacao_descarte',
]
const DATAS = ['data_depoimento', 'data_postagem']
// Unico enum opcional de depoimento (os demais sao not null).
const ENUMS_OPCIONAIS = ['motivo_descarte']

function textoOuNulo(valor) {
  if (valor === null || valor === undefined) return null
  return String(valor).trim() === '' ? null : valor
}

function prepararNota(nota) {
  return {
    ...nota,
    materia_id: numeroOuNulo(nota.materia_id),
    valor_original: numeroOuNulo(nota.valor_original),
    // Maximo so existe em PONTOS: um maximo que sobrou de quando a escala
    // era outra nao pode ir para o banco.
    valor_maximo: nota.escala === 'PONTOS' ? numeroOuNulo(nota.valor_maximo) : null,
  }
}

function prepararResultado(resultado) {
  return {
    ...resultado,
    instituicao_id: numeroOuNulo(resultado.instituicao_id),
    curso_id: numeroOuNulo(resultado.curso_id),
  }
}

function prepararParticipacao(participacao) {
  return {
    ...participacao,
    prova_id: numeroOuNulo(participacao.prova_id),
    ano: numeroOuNulo(participacao.ano),
    notas: (participacao.notas ?? []).map(prepararNota),
    resultados: (participacao.resultados ?? []).map(prepararResultado),
  }
}

// tipos/canais: sem brancos (seriam valor de enum invalido, 22P02) e sem
// repetidos (seriam chave duplicada, 23505), na ordem da primeira aparicao.
function listaDeValores(lista) {
  return [...new Set((lista ?? []).filter((v) => textoOuNulo(v) !== null))]
}

export function prepararFicha(ficha) {
  const pronta = {
    ...ficha,
    tipos: listaDeValores(ficha.tipos),
    canais: listaDeValores(ficha.canais),
    participacoes: (ficha.participacoes ?? []).map(prepararParticipacao),
  }
  if ('id' in ficha) pronta.id = numeroOuNulo(ficha.id)
  pronta.aluno_id = numeroOuNulo(ficha.aluno_id)
  for (const campo of [...TEXTOS_OPCIONAIS, ...DATAS, ...ENUMS_OPCIONAIS]) {
    pronta[campo] = textoOuNulo(ficha[campo])
  }
  return pronta
}
