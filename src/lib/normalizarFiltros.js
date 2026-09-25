// Helpers de coercao e parsing de URL usados por src/lib/filtros.js.
// Extraido de filtros.js no fix round 2 (Marco 2, 2026-09-24) porque o
// arquivo original passou de ~300 linhas — ver
// .superpowers/sdd/2026-09-23-nucleo-depoimentos/marco-2-fix-brief.md
// ("Keep src/lib/filtros.js focused"). Logica pura: sem Vue, sem
// supabase-js.
//
// Toda entrada numerica (de estado da UI, que pode trazer string de
// formulario, ou de URL editada a mao) passa pela mesma coercao central
// (`paraNumero`) antes de ser validada. Ids (instituicoes/provas/cursos/
// materia_id de notas) exigem inteiro seguro e positivo; ano/anoDe/anoAte
// exigem inteiro na faixa 1990-2100 (mesma faixa de ck_ano em
// participacao); minimo so exige numero finito (aceita decimal). Familia
// desconhecida numa condicao de nota descarta a condicao.

import { paraNumero } from './numero.js'

// Coercao central (paraNumero) mora em numero.js, compartilhada com
// validacao.js e ficha.js; reexportada aqui para quem ja a importava daqui.
export { paraNumero }

export const OPERADORES_VALIDOS = new Set(['=', '>='])
const FAMILIAS_VALIDAS = new Set(['PERCENTUAL', 'TRI'])

function ehIdPositivo(n) {
  return Number.isSafeInteger(n) && n > 0
}

// Elemento de lista (instituicoes/provas/cursos): inteiro seguro positivo,
// senao descartado. Cobre tanto string de URL/form quanto lixo (1.5, 1e30,
// negativo, zero, null, texto) — sem isso a lib repassa lixo para o banco
// e `buscar_depoimentos` derruba a chamada com erro de bigint.
export function idValido(valor) {
  const n = paraNumero(valor)
  return ehIdPositivo(n) ? n : null
}

export function idsValidos(lista) {
  return (lista ?? []).map(idValido).filter((n) => n != null)
}

// Ano/anoDe/anoAte: inteiro na mesma faixa de ck_ano (participacao).
export function anoValido(valor) {
  const n = paraNumero(valor)
  return Number.isInteger(n) && n >= 1990 && n <= 2100 ? n : null
}

// A funcao SQL nao tolera elemento null dentro de array. Nunca deixamos um
// escapar daqui. (Listas de texto: tipos/canais/status — nao sao ids.)
export function semNulos(lista) {
  return (lista ?? []).filter((item) => item != null)
}

// Item de nota/tri sem materia_id valido (mesma regra de idValido) ou sem
// minimo numerico casa com nada em silencio no banco — ou, no caso de
// materia_id nao inteiro, derruba a chamada com erro de bigint; melhor nem
// montar a condicao. Familia desconhecida tambem descarta: sem essa
// guarda, uma familia invalida cairia no grupo PERCENTUAL por engano (a
// classificacao em montarFiltros trata "!== 'TRI'" como percentual).
export function condicaoValida(nota) {
  return ehIdPositivo(nota.materia_id)
    && Number.isFinite(nota.minimo)
    && (nota.familia == null || FAMILIAS_VALIDAS.has(nota.familia))
}

// Coerce materia_id/minimo de uma condicao de nota, preservando as demais
// chaves (familia, operador) — mesma coercao central usada pelas listas.
export function coagirCondicao(nota) {
  return { ...nota, materia_id: paraNumero(nota.materia_id), minimo: paraNumero(nota.minimo) }
}

// Estado da UI: operador fora de =/>=/ausente e bug do chamador — falha
// cedo, em vez de virar ">=" em silencio.
export function validarOperador(nota) {
  const { operador } = nota
  if (operador != null && !OPERADORES_VALIDOS.has(operador)) {
    throw new Error(`operador invalido: ${operador}`)
  }
}

export function textosLimpos(valor) {
  if (!valor) return []
  return valor
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
}

// Ids de lista vindos de uma URL podem ter sido editados a mao: pedaco
// vazio, texto onde deveria ser numero, decimal ou fora da faixa segura de
// inteiro. `idValido` (mesma regra usada pelo estado da UI) trata tudo
// isso como ausente em vez de derrubar a busca com erro de bigint.
export function idsLimpos(valor) {
  if (!valor) return []
  return valor
    .split(',')
    .map((item) => idValido(item))
    .filter((n) => n != null)
}

export function analisarNotas(valor) {
  if (!valor) return []
  return valor
    .split(',')
    .map((item) => {
      const [materiaIdStr, minimoStr, familia, operador] = item.split(':')
      const condicao = {
        materia_id: paraNumero(materiaIdStr),
        minimo: paraNumero(minimoStr),
        familia,
      }
      // URL editada a mao: 4o segmento desconhecido e descartado (condicao
      // continua valendo, so sem operador) — nunca lanca, diferente de
      // montarFiltros.
      if (OPERADORES_VALIDOS.has(operador)) condicao.operador = operador
      return condicao
    })
    // materia_id nao inteiro/nao positivo, minimo nao numerico ou familia
    // desconhecida (ex.: "1:90:FOO") descartam a condicao inteira.
    .filter(condicaoValida)
}

// Qualquer valor de "print" (ou "link", Task 21) diferente de
// "true"/"false" literal e tratado como ausente — nunca vira false por
// engano (ex.: print=sim, link=nao).
export function booleanoOuNulo(valor) {
  if (valor === 'true') return true
  if (valor === 'false') return false
  return null
}
