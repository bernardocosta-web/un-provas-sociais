export function normalizar(texto) {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function termosDe(instituicao) {
  return [instituicao.nome_canonico, ...(instituicao.apelidos ?? [])].map(normalizar)
}

export function combina(instituicao, termo) {
  const alvo = normalizar(termo)
  if (!alvo) return true
  return termosDe(instituicao).some((t) => t.includes(alvo))
}

export function ordenarPorRelevancia(lista, termo) {
  const alvo = normalizar(termo)
  const peso = (instituicao) => {
    const termos = termosDe(instituicao)
    if (termos.some((t) => t === alvo)) return 0
    if (termos.some((t) => t.startsWith(alvo))) return 1
    return 2
  }
  return [...lista].sort(
    (a, b) => peso(a) - peso(b) || a.nome_canonico.localeCompare(b.nome_canonico, 'pt-BR'))
}

// Prova e curso tem so `nome`; combina()/ordenarPorRelevancia() leem
// nome_canonico e apelidos. O combobox da ficha adapta antes de buscar.
export function comoOpcao(item) {
  return { id: item.id, nome_canonico: item.nome, apelidos: [] }
}

// Sugestoes do combobox: so o que combina, o mais relevante primeiro.
export function sugerirOpcoes(opcoes, termo, limite = 8) {
  return ordenarPorRelevancia(opcoes.filter((o) => combina(o, termo)), termo).slice(0, limite)
}

// "Criar na hora" so aparece quando nenhum nome ou apelido e igual ao termo
// (trecho nao conta): evita a duplicata mais obvia.
export function existeExato(opcoes, termo) {
  const alvo = normalizar(termo)
  if (!alvo) return false
  return opcoes.some((o) => termosDe(o).includes(alvo))
}
