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
