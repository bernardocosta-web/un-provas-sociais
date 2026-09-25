// Rotas por hash (spec, secao 10: o GitHub Pages nao reescreve URL).
// Logica pura: recebe a string do hash, devolve qual tela abrir e a
// consulta (o que vem depois do "?", sem o "?").
//   '#/ficha'              -> ficha nova
//   '#/ficha/12'           -> editar o depoimento 12
//   '#/cadastros'          -> cadastros (so por rota explicita)
//   '#/depoimentos?ano=..' -> lista, com os filtros na consulta
//   o resto (hash vazio, '#/', id invalido, lixo) -> lista
// Task 21: o fallback passou de 'cadastros' para 'depoimentos'.
const PADRAO_ROTA = /^#\/(ficha(?:\/(\d+))?|cadastros|depoimentos)?\/?(?:\?(.*))?$/

const LISTA_VAZIA = Object.freeze({ tela: 'depoimentos', id: null, consulta: '' })

export function interpretarRota(hash) {
  const achado = PADRAO_ROTA.exec(hash ?? '')
  if (!achado) return { ...LISTA_VAZIA }
  const consulta = achado[3] ?? ''
  if (achado[1] === undefined || achado[1] === 'depoimentos') {
    return { tela: 'depoimentos', id: null, consulta }
  }
  if (achado[1] === 'cadastros') return { tela: 'cadastros', id: null, consulta }
  // achado[1] e 'ficha' ou 'ficha/<digitos>' (achado[2])
  if (achado[2] === undefined) return { tela: 'ficha', id: null, consulta }
  const id = Number(achado[2])
  if (!Number.isSafeInteger(id) || id < 1) return { ...LISTA_VAZIA }
  return { tela: 'ficha', id, consulta }
}

export function rotaDaFicha(id) {
  return id == null ? '#/ficha' : `#/ficha/${id}`
}

// Consulta ja serializada (filtrosParaUrl, src/lib/filtros.js).
export function rotaDaLista(consulta = '') {
  return consulta ? `#/depoimentos?${consulta}` : '#/depoimentos'
}
