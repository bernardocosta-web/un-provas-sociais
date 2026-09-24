// Conversao unica de numero vindo de formulario ou de URL, compartilhada por
// validacao.js, normalizarFiltros.js e ficha.js (revisao conjunta,
// 2026-09-24: antes havia um `numero()` em validacao.js e um `paraNumero`
// em normalizarFiltros.js fazendo a mesma coisa). Logica pura: sem Vue, sem
// supabase-js.
//
// Valores de formulario chegam como string ('18', ' 20 ', ''). Number('') e
// Number('  ') dao 0, nao ausencia — por isso o trim e a checagem de vazio
// antes de converter; sem a conversao, '9' > '20' (comparacao lexica)
// engana qualquer regra de "passar do maximo".

// number passa direto; string e trimada e convertida (vazia/so espaco vira
// NaN, nunca 0); qualquer outro tipo (null, undefined, objeto) vira NaN.
export function paraNumero(valor) {
  if (typeof valor === 'number') return valor
  if (typeof valor === 'string') {
    const limpo = valor.trim()
    return limpo === '' ? NaN : Number(limpo)
  }
  return NaN
}

// Mesma conversao, mas ausencia/lixo vira null — o formato que o banco
// entende como "sem valor".
export function numeroOuNulo(valor) {
  const n = paraNumero(valor)
  return Number.isFinite(n) ? n : null
}
