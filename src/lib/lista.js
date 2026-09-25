// Lista de depoimentos (Task 21, spec §6.1): abas por fonte, colunas de
// cada aba e a linha pronta para exibir. Logica pura: sem Vue, sem
// supabase-js. A URL publica da logo e derivada no componente (urlDaLogo).
import { TIPOS, FONTES, AUTORIZACOES, STATUS } from './rotulos.js'

// A aba e o filtro de fonte (emenda 2026-09-24): "Todos" nao filtra;
// montarFiltros converte as outras em `fontes`.
export const ABAS = [
  { valor: 'TODOS', rotulo: 'Todos' },
  { valor: 'GOOGLE_REVIEW', rotulo: 'Google' },
  { valor: 'GOOGLE_FORMS', rotulo: 'Forms' },
  { valor: 'MANUAL', rotulo: 'Manual' },
]

const TITULOS = {
  fonte: 'Fonte', autor: 'Autor', resumo: 'Resumo', texto: 'Texto', link: 'Link original',
  contato: '@ do Instagram', autorizacao: 'Autorização', tipos: 'Tipos',
  logos: 'Aprovações', status: 'Status', data: 'Data',
}

// [chaves, destaques, titulos trocados]. Tabela da spec §6.1: a
// autorizacao existe (e em destaque) so na aba Forms — nas outras e sempre
// NAO_INFORMADO e viraria ruido. Tipos, logos e status ficam em toda aba.
const DEFINICAO = {
  TODOS: [['fonte', 'autor', 'resumo', 'tipos', 'logos', 'status', 'data'], []],
  GOOGLE_REVIEW: [
    ['autor', 'texto', 'link', 'data', 'tipos', 'logos', 'status'],
    ['autor', 'texto', 'link', 'data']],
  GOOGLE_FORMS: [
    ['autor', 'autorizacao', 'contato', 'texto', 'tipos', 'logos', 'status', 'data'],
    ['autor', 'autorizacao', 'contato', 'texto'], { autor: 'Nome', texto: 'Depoimento' }],
  MANUAL: [
    ['resumo', 'autor', 'tipos', 'logos', 'status', 'data'], ['resumo', 'autor']],
}

export function colunasDaAba(aba) {
  const [chaves, destaques, titulos = {}] = DEFINICAO[aba] ?? DEFINICAO.TODOS
  return chaves.map((chave) => ({
    chave,
    titulo: titulos[chave] ?? TITULOS[chave],
    destaque: destaques.includes(chave),
  }))
}

const rotuloDe = (opcoes, valor) => opcoes.find((o) => o.valor === valor)?.rotulo ?? valor ?? ''
const limpo = (texto) => (texto ?? '').trim()

export function trecho(texto, limite = 160) {
  const t = limpo(texto)
  return t.length <= limite ? t : `${t.slice(0, limite - 1)}…`
}

export function dataBr(data) {
  const achado = /^(\d{4})-(\d{2})-(\d{2})/.exec(data ?? '')
  return achado ? `${achado[3]}/${achado[2]}/${achado[1]}` : ''
}

export function textoContagem(n) {
  return `${n} ${n === 1 ? 'depoimento' : 'depoimentos'}`
}

// So as aprovadas, sem repetir (a mesma instituicao pode aparecer em mais
// de uma participacao), na ordem em que aparecem.
function instituicoesAprovadas(participacoes) {
  const vistas = new Map()
  for (const p of participacoes ?? []) {
    for (const r of p.resultado ?? []) {
      const i = r.instituicao
      if (r.situacao !== 'APROVADO' || !i || vistas.has(i.id)) continue
      vistas.set(i.id, { id: i.id, nome: i.nome_canonico, logo_path: i.logo_path ?? null })
    }
  }
  return [...vistas.values()]
}

// Linha vinda de buscarDepoimentos com COLUNAS_LISTA (src/dados/depoimentos.js).
export function linhaDaLista(d) {
  return {
    id: d.id,
    resumo: limpo(d.resumo_curto) || trecho(d.texto_completo),
    texto: trecho(d.texto_completo, 280),
    autor: limpo(d.autor_bruto),
    contato: limpo(d.autor_contato_bruto),
    fonte: rotuloDe(FONTES, d.fonte),
    link: limpo(d.link_original),
    data: dataBr(d.data_depoimento),
    autorizacao: rotuloDe(AUTORIZACOES, d.autorizacao_publicacao),
    status: rotuloDe(STATUS, d.status_uso),
    tipos: (d.depoimento_tipo ?? []).map((t) => rotuloDe(TIPOS, t.tipo)),
    instituicoes: instituicoesAprovadas(d.participacao),
  }
}
