// Monta o `p_filtros` consumido por `buscar_depoimentos` (Task 11) e
// serializa o estado dos filtros da UI na URL (hash), para navegacao e
// compartilhamento de link. Logica pura: sem Vue, sem supabase-js.
//
// Contrato de p_filtros (ver docs/superpowers/plans/2026-09-23-nucleo-depoimentos.md,
// Task 11, emenda 2026-09-24): ausente/null/[] = nao filtra; a funcao nao
// tolera elemento null dentro de array, nem item de notas/tri sem minimo ou
// materia_id (casam com nada em silencio); escalar no lugar de array, ou
// ano/ano_de/ano_ate nao inteiro, derrubam a chamada com erro. Esta lib
// nunca deve montar p_filtros assim.
//
// Fix round 2 (Marco 2, 2026-09-24): a coercao/validacao numerica central
// e o parsing de URL moraram para o modulo irmao `normalizarFiltros.js`
// (arquivo original passou de ~300 linhas). Ids exigem inteiro seguro e
// positivo; ano/anoDe/anoAte exigem a faixa 1990-2100 de ck_ano; minimo so
// exige numero finito (aceita decimal); familia desconhecida numa condicao
// de nota descarta a condicao. Aplicado tanto em montarFiltros (estado da
// UI, defesa em profundidade) quanto em urlParaFiltros (URL editada a mao).

import {
  idsValidos, anoValido, semNulos, condicaoValida,
  coagirCondicao, validarOperador, textosLimpos, idsLimpos, analisarNotas,
  booleanoOuNulo,
} from './normalizarFiltros.js'

export function estadoVazio() {
  return {
    aba: 'TODOS',
    texto: '',
    tipos: [],
    canais: [],
    status: [],
    instituicoes: [],
    provas: [],
    cursos: [],
    ano: null,
    anoDe: null,
    anoAte: null,
    notas: [],
    temPrint: null,
    // Task 21: so link_original (nao ha filtro para link_post).
    temLinkOriginal: null,
  }
}

// Congelado no nivel do objeto E de cada array interno: sem o segundo
// freeze, `{ ...ESTADO_VAZIO }` (copia rasa) ainda compartilharia os
// mesmos arrays, e `copia.tipos.push('x')` mutaria o ESTADO_VAZIO de todo
// mundo. Quem precisa de uma copia nova e mutavel usa `estadoVazio()`.
export const ESTADO_VAZIO = Object.freeze({
  ...estadoVazio(),
  tipos: Object.freeze([]),
  canais: Object.freeze([]),
  status: Object.freeze([]),
  instituicoes: Object.freeze([]),
  provas: Object.freeze([]),
  cursos: Object.freeze([]),
  notas: Object.freeze([]),
})

const LISTAS_TEXTO = {
  tipos: 'tipos',
  canais: 'canais',
  status: 'status',
}

const LISTAS_ID = {
  instituicoes: 'instituicoes',
  provas: 'provas',
  cursos: 'cursos',
}

export function montarFiltros(estado) {
  const filtros = {}

  if (estado.aba && estado.aba !== 'TODOS') filtros.fontes = [estado.aba]
  if (estado.texto?.trim()) filtros.texto = estado.texto.trim()

  const ano = anoValido(estado.ano)
  const anoDe = anoValido(estado.anoDe)
  const anoAte = anoValido(estado.anoAte)
  if (ano != null) filtros.ano = ano
  if (anoDe != null) filtros.ano_de = anoDe
  if (anoAte != null) filtros.ano_ate = anoAte

  if (estado.temPrint != null) filtros.tem_print = estado.temPrint
  if (estado.temLinkOriginal != null) filtros.tem_link_original = estado.temLinkOriginal

  for (const [campo, chave] of Object.entries(LISTAS_TEXTO)) {
    const lista = semNulos(estado[campo])
    if (lista.length) filtros[chave] = lista
  }
  for (const [campo, chave] of Object.entries(LISTAS_ID)) {
    const lista = idsValidos(estado[campo])
    if (lista.length) filtros[chave] = lista
  }

  // Estado da UI: operador fora de =/>=/ausente e bug do chamador — falha
  // cedo, em vez de virar ">=" em silencio.
  const notas = (estado.notas ?? []).map(coagirCondicao)
  notas.forEach(validarOperador)

  // Percentual e TRI sao familias separadas: TRI nunca vira percentual, e
  // misturar as duas num filtro so produziria resultado errado em silencio.
  const notasValidas = notas.filter(condicaoValida)
  const percentual = notasValidas.filter((n) => n.familia !== 'TRI')
  const tri = notasValidas.filter((n) => n.familia === 'TRI')

  if (percentual.length) {
    filtros.notas = percentual.map((n) => {
      const condicao = { materia_id: n.materia_id, minimo: n.minimo }
      // So mandamos operador quando e "=": ">=" ja e o padrao do banco
      // quando ausente, e qualquer outro valor deve ser tratado como se
      // estivesse ausente (nunca repassado, pra nao arriscar um erro la).
      if (n.operador === '=') condicao.operador = '='
      return condicao
    })
  }
  if (tri.length) {
    // tri nunca carrega operador: a funcao ignora e e sempre ">=".
    filtros.tri = tri.map((n) => ({ materia_id: n.materia_id, minimo: n.minimo }))
  }

  return filtros
}

export function filtrosParaUrl(estado) {
  const params = new URLSearchParams()
  if (estado.aba && estado.aba !== 'TODOS') params.set('aba', estado.aba)
  if (estado.texto?.trim()) params.set('q', estado.texto.trim())

  const ano = anoValido(estado.ano)
  const anoDe = anoValido(estado.anoDe)
  const anoAte = anoValido(estado.anoAte)
  if (ano != null) params.set('ano', String(ano))
  if (anoDe != null) params.set('ano_de', String(anoDe))
  if (anoAte != null) params.set('ano_ate', String(anoAte))

  if (estado.temPrint != null) params.set('print', String(estado.temPrint))
  // Mesma convencao de print: true/false literal (Task 21, decisao do controlador).
  if (estado.temLinkOriginal != null) params.set('link', String(estado.temLinkOriginal))

  for (const campo of Object.keys(LISTAS_TEXTO)) {
    const lista = semNulos(estado[campo])
    if (lista.length) params.set(campo, lista.join(','))
  }
  for (const campo of Object.keys(LISTAS_ID)) {
    const lista = idsValidos(estado[campo])
    if (lista.length) params.set(campo, lista.join(','))
  }

  // Mesma coercao/guarda de montarFiltros: materia_id/minimo passam pela
  // conversao central antes de validar (ex.: bigint do Postgres chega como
  // string '1' no cliente pg, nao como number), senao uma condicao valida
  // seria descartada aqui e a URL sairia sem "notas" por engano.
  const notasValidas = (estado.notas ?? []).map(coagirCondicao).filter(condicaoValida)
  if (notasValidas.length) {
    params.set(
      'notas',
      notasValidas
        .map((n) => {
          const partes = [n.materia_id, n.minimo, n.familia ?? 'PERCENTUAL']
          if (n.operador) partes.push(n.operador)
          return partes.join(':')
        })
        .join(','),
    )
  }

  return params.toString()
}

export function urlParaFiltros(texto) {
  const params = new URLSearchParams(texto)

  return {
    ...estadoVazio(),
    aba: params.get('aba') ?? 'TODOS',
    texto: (params.get('q') ?? '').trim(),
    tipos: textosLimpos(params.get('tipos')),
    canais: textosLimpos(params.get('canais')),
    status: textosLimpos(params.get('status')),
    instituicoes: idsLimpos(params.get('instituicoes')),
    provas: idsLimpos(params.get('provas')),
    cursos: idsLimpos(params.get('cursos')),
    ano: anoValido(params.get('ano')),
    anoDe: anoValido(params.get('ano_de')),
    anoAte: anoValido(params.get('ano_ate')),
    temPrint: booleanoOuNulo(params.get('print')),
    temLinkOriginal: booleanoOuNulo(params.get('link')),
    notas: analisarNotas(params.get('notas')),
  }
}
