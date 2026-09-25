// Edicao do estado de filtros pelo painel da lista (Task 21). Logica pura:
// o PainelFiltros.vue so liga controles a estas funcoes. Toda funcao
// devolve valor novo (nunca muta o estado recebido): o estado de verdade
// mora na URL, e cada mudanca vira um hash novo.
import { estadoVazio } from './filtros.js'
import { idValido, paraNumero } from './normalizarFiltros.js'

export function alternar(lista, valor) {
  const atual = lista ?? []
  return atual.includes(valor) ? atual.filter((v) => v !== valor) : [...atual, valor]
}

// Spec §6.1: cada condicao de percentual e materia + operador (=100%,
// >=90%, >=70%, livre). TRI e outro controle (condicaoTri): misturar as
// familias produziria resultado errado em silencio.
export const PRESETS_PERCENTUAL = [
  { chave: '=100', rotulo: '= 100%', operador: '=', minimo: 100 },
  { chave: '>=90', rotulo: '≥ 90%', operador: '>=', minimo: 90 },
  { chave: '>=70', rotulo: '≥ 70%', operador: '>=', minimo: 70 },
  { chave: 'livre', rotulo: 'Livre' },
]

const entre = (n, min, max) => Number.isFinite(n) && n >= min && n <= max

export function condicaoPercentual({ materia, preset, operador, minimo }) {
  const materiaId = idValido(materia)
  const escolhido = PRESETS_PERCENTUAL.find((p) => p.chave === preset)
  if (materiaId == null || !escolhido) return null
  if (escolhido.chave !== 'livre') {
    return { materia_id: materiaId, minimo: escolhido.minimo, familia: 'PERCENTUAL', operador: escolhido.operador }
  }
  const valor = paraNumero(minimo)
  if (!entre(valor, 0, 100) || !['=', '>='].includes(operador)) return null
  return { materia_id: materiaId, minimo: valor, familia: 'PERCENTUAL', operador }
}

// TRI: materia + pontuacao minima (sempre >=; 0-1000 como ck_tri_faixa).
export function condicaoTri({ materia, minimo }) {
  const materiaId = idValido(materia)
  const valor = paraNumero(minimo)
  if (materiaId == null || !entre(valor, 0, 1000)) return null
  return { materia_id: materiaId, minimo: valor, familia: 'TRI' }
}

export function descreverCondicao(nota, materias) {
  const nome = materias.find((m) => m.id === nota.materia_id)?.nome ?? `Matéria #${nota.materia_id}`
  if (nota.familia === 'TRI') return `${nome} (TRI) ≥ ${nota.minimo}`
  return `${nome} ${nota.operador === '=' ? '=' : '≥'} ${nota.minimo}%`
}

export function removerCondicao(notas, indice) {
  return notas.filter((_, i) => i !== indice)
}

// <select> de sim/nao/qualquer: '' e "nao filtra".
export function booleanoParaCampo(valor) {
  return valor == null ? '' : String(valor)
}

export function campoParaBooleano(campo) {
  if (campo === 'true') return true
  if (campo === 'false') return false
  return null
}

// "Limpar filtros": sempre estadoVazio() (copia nova e mutavel), nunca
// ESTADO_VAZIO (emenda da Task 12). A aba fica: ela nao e controle do
// painel, e a fonte escolhida continua valendo.
export function limparFiltros(estado) {
  return { ...estadoVazio(), aba: estado.aba ?? 'TODOS' }
}
