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

export const ESTADO_VAZIO = Object.freeze({
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
})

const LISTAS = {
  tipos: 'tipos',
  canais: 'canais',
  status: 'status',
  instituicoes: 'instituicoes',
  provas: 'provas',
  cursos: 'cursos',
}

// A funcao SQL nao tolera elemento null dentro de array. Nunca deixamos um
// escapar daqui.
function semNulos(lista) {
  return (lista ?? []).filter((item) => item != null)
}

// Item de nota/tri sem materia_id ou minimo numerico casa com nada em
// silencio no banco; melhor nem montar a condicao.
function condicaoValida(nota) {
  return Number.isFinite(nota.materia_id) && Number.isFinite(nota.minimo)
}

// Origem confiavel (estado da UI, em montarFiltros) e origem nao confiavel
// (URL editada a mao, em urlParaFiltros) tratam operador invalido de jeito
// diferente — ver as duas funcoes abaixo.
const OPERADORES_VALIDOS = new Set(['=', '>='])

function validarOperador(nota) {
  const { operador } = nota
  if (operador != null && !OPERADORES_VALIDOS.has(operador)) {
    throw new Error(`operador invalido: ${operador}`)
  }
}

export function montarFiltros(estado) {
  const filtros = {}

  if (estado.aba && estado.aba !== 'TODOS') filtros.fontes = [estado.aba]
  if (estado.texto?.trim()) filtros.texto = estado.texto.trim()
  if (Number.isInteger(estado.ano)) filtros.ano = estado.ano
  if (Number.isInteger(estado.anoDe)) filtros.ano_de = estado.anoDe
  if (Number.isInteger(estado.anoAte)) filtros.ano_ate = estado.anoAte
  if (estado.temPrint != null) filtros.tem_print = estado.temPrint

  for (const [campo, chave] of Object.entries(LISTAS)) {
    const lista = semNulos(estado[campo])
    if (lista.length) filtros[chave] = lista
  }

  // Estado da UI: operador fora de =/>=/ausente e bug do chamador — falha
  // cedo, em vez de virar ">=" em silencio.
  const notas = estado.notas ?? []
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
  if (Number.isInteger(estado.ano)) params.set('ano', String(estado.ano))
  if (Number.isInteger(estado.anoDe)) params.set('ano_de', String(estado.anoDe))
  if (Number.isInteger(estado.anoAte)) params.set('ano_ate', String(estado.anoAte))
  if (estado.temPrint != null) params.set('print', String(estado.temPrint))

  for (const campo of Object.keys(LISTAS)) {
    const lista = semNulos(estado[campo])
    if (lista.length) params.set(campo, lista.join(','))
  }

  // Mesma guarda de montarFiltros: condicao invalida nao vira URL.
  const notasValidas = (estado.notas ?? []).filter(condicaoValida)
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

// Numeros vindos de uma URL podem ter sido editados a mao: pedaco vazio,
// texto onde deveria ser numero etc. Tratamos como ausente em vez de
// derrubar a busca.
function numerosLimpos(valor) {
  if (!valor) return []
  return valor
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
    .map(Number)
    .filter((n) => Number.isFinite(n))
}

function textosLimpos(valor) {
  if (!valor) return []
  return valor
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
}

function inteiroOuNulo(valor) {
  if (valor == null || valor.trim() === '') return null
  const numero = Number(valor)
  return Number.isInteger(numero) ? numero : null
}

// Number('') e Number('  ') sao 0, nao NaN — pedaco vazio ou so espaco
// (`notas=:900:TRI`) nao pode virar materia_id/minimo 0.
function paraNumero(valor) {
  if (valor == null || valor.trim() === '') return NaN
  return Number(valor)
}

function analisarNotas(valor) {
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
    .filter(condicaoValida)
}

export function urlParaFiltros(texto) {
  const params = new URLSearchParams(texto)

  return {
    ...ESTADO_VAZIO,
    aba: params.get('aba') ?? 'TODOS',
    texto: (params.get('q') ?? '').trim(),
    tipos: textosLimpos(params.get('tipos')),
    canais: textosLimpos(params.get('canais')),
    status: textosLimpos(params.get('status')),
    instituicoes: numerosLimpos(params.get('instituicoes')),
    provas: numerosLimpos(params.get('provas')),
    cursos: numerosLimpos(params.get('cursos')),
    ano: inteiroOuNulo(params.get('ano')),
    anoDe: inteiroOuNulo(params.get('ano_de')),
    anoAte: inteiroOuNulo(params.get('ano_ate')),
    temPrint: params.get('print') ? params.get('print') === 'true' : null,
    notas: analisarNotas(params.get('notas')),
  }
}
