import { supabase } from './cliente.js'
import { guardarRetorno, retomarRetorno } from '../lib/retorno.js'
import { guardarUltimaLista, rotaVoltarLista } from '../lib/ultimaLista.js'

// window.sessionStorage pode lancar so de ser lido (site data bloqueado).
function storageDaSessao() {
  try {
    return window.sessionStorage ?? null
  } catch {
    return null
  }
}

export async function usuarioAtual() {
  const { data } = await supabase.auth.getUser()
  return data?.user ?? null
}

// O OAuth volta para a base sem o hash: guarda-o antes (src/lib/retorno.js).
export async function entrarComGoogle() {
  guardarRetorno(storageDaSessao(), window.location.hash)
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
  })
  if (error) throw error
}

export async function sair() {
  await supabase.auth.signOut()
}

export function aoMudarSessao(callback) {
  return supabase.auth.onAuthStateChange((_evento, sessao) => callback(sessao))
}

// Hash guardado antes do OAuth (uma vez so; depois e apagado), ou null.
export function retomarRetornoDoLogin() {
  return retomarRetorno(storageDaSessao())
}

// M5-A item 3: chamado (App.vue) ao sair da lista para a ficha, para o
// botao "Voltar a lista" devolver aos mesmos filtros e a mesma aba.
export function guardarUltimaListaAoSair(hash) {
  guardarUltimaLista(storageDaSessao(), hash)
}

// Hash para onde "Voltar a lista" navega: a ultima lista visitada, ou
// "#/depoimentos" sem uma guardada.
export function rotaDeVoltarLista() {
  return rotaVoltarLista(storageDaSessao())
}
