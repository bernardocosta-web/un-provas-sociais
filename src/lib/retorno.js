// Link compartilhado sobrevive ao login (revisao do Marco 5). O OAuth do
// Google volta para a base da app, sem o hash: quem abria deslogado um
// link como #/depoimentos?instituicoes=7 caia na lista vazia de filtros.
// Guarda-se o hash (sessionStorage) antes do OAuth e restaura-se uma vez
// depois do login. Logica pura: o storage e injetado.
export const CHAVE_RETORNO = 'un-provas-sociais:retorno'

// So rotas da app ("#/" seguido de algo); nunca fragmento de token do OAuth.
const ROTA_DA_APP = /^#\/./

export function guardarRetorno(storage, hash) {
  try {
    if (ROTA_DA_APP.test(hash ?? '')) storage.setItem(CHAVE_RETORNO, hash)
    else storage.removeItem(CHAVE_RETORNO)
  } catch {
    // Storage indisponivel (modo privado, bloqueado): o login segue sem retorno.
  }
}

export function retomarRetorno(storage) {
  try {
    const hash = storage.getItem(CHAVE_RETORNO)
    storage.removeItem(CHAVE_RETORNO)
    return ROTA_DA_APP.test(hash ?? '') ? hash : null
  } catch {
    return null
  }
}
