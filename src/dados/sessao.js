import { supabase } from './cliente.js'
import { guardarRetorno, retomarRetorno } from '../lib/retorno.js'

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
