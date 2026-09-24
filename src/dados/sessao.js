import { supabase } from './cliente.js'

export async function usuarioAtual() {
  const { data } = await supabase.auth.getUser()
  return data?.user ?? null
}

export async function entrarComGoogle() {
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
