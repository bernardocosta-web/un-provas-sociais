// Rotas por hash (spec, secao 10: o GitHub Pages nao reescreve URL).
// Logica pura: recebe a string do hash, devolve qual tela abrir.
//   '#/ficha'    -> ficha nova
//   '#/ficha/12' -> editar o depoimento 12
//   o resto (inclusive id invalido) -> cadastros
const PADRAO_FICHA = /^#\/ficha(?:\/(\d+))?\/?$/

export function interpretarRota(hash) {
  const achado = PADRAO_FICHA.exec(hash ?? '')
  if (!achado) return { tela: 'cadastros' }
  if (achado[1] === undefined) return { tela: 'ficha', id: null }
  const id = Number(achado[1])
  if (!Number.isSafeInteger(id) || id < 1) return { tela: 'cadastros' }
  return { tela: 'ficha', id }
}

export function rotaDaFicha(id) {
  return id == null ? '#/ficha' : `#/ficha/${id}`
}
