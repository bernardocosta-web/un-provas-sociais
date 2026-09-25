// Ultima rota de lista visitada (M5-A item 3, pedido do dono): o botao
// "Voltar a lista" da ficha volta para a lista com os mesmos filtros e a
// mesma aba de antes, em vez de sempre para "#/depoimentos" em branco.
// Guarda-se o hash (sessionStorage) ao sair da lista para a ficha. Mesma
// cautela de src/lib/retorno.js: so aceita rotas internas de lista (nunca
// um fragmento estranho, como o de um retorno de OAuth). Logica pura: o
// storage e injetado.
import { interpretarRota, rotaDaLista } from './rotas.js'

export const CHAVE_ULTIMA_LISTA = 'un-provas-sociais:ultima-lista'

// "#/", "#/depoimentos" (com ou sem consulta), vazio — nunca ficha nem
// cadastros, nem lixo de OAuth.
const ROTA_DA_LISTA = /^#\/(depoimentos)?\/?(?:\?.*)?$/

export function guardarUltimaLista(storage, hash) {
  try {
    if (ROTA_DA_LISTA.test(hash ?? '')) {
      storage.setItem(CHAVE_ULTIMA_LISTA, rotaDaLista(interpretarRota(hash).consulta))
    } else {
      storage.removeItem(CHAVE_ULTIMA_LISTA)
    }
  } catch {
    // Storage indisponivel (modo privado, bloqueado): o botao cai no fallback.
  }
}

// Sem rota guardada (ou storage indisponivel/adulterado): "#/depoimentos" em branco.
export function rotaVoltarLista(storage) {
  try {
    const hash = storage.getItem(CHAVE_ULTIMA_LISTA)
    return hash && ROTA_DA_LISTA.test(hash) ? hash : '#/depoimentos'
  } catch {
    return '#/depoimentos'
  }
}
