// Usuários dos e2e: um MEMBRO (em membro_equipe, ativo) e um ESTRANHO (fora
// da lista). Criados pela Admin API (service key lida em tempo de execução,
// nunca no repositório); a sessão sai de magic link + /verify, o mesmo
// caminho dos testes de auth — o local só tem o provedor Google.
import {
  URL_BASE_AUTH, obterApiKey, obterChaveServico, criarUsuarioAdmin, obterSessaoPorMagicLink,
} from '../../testes/auth/ajuda.js'
import { conectar } from '../../testes/rls/ajuda.js'
import { marcador } from './marcador.js'

// Prefixo que a limpeza reconhece, também de execuções interrompidas.
export const PREFIXO_EMAIL = 'e2e-'
const email = (papel) => `${PREFIXO_EMAIL}${papel}-${marcador().toLowerCase()}@exemplo.test`

export const emailMembro = () => email('membro')
export const emailEstranho = () => email('estranho')

export async function criarUsuarios() {
  const chave = obterChaveServico()
  await criarUsuarioAdmin(chave, emailMembro())
  await criarUsuarioAdmin(chave, emailEstranho())
  const cliente = await conectar()
  try {
    await cliente.query(
      `insert into membro_equipe (email, nome, ativo) values ($1, 'Membro E2E', true)`,
      [emailMembro()])
  } finally {
    await cliente.end()
  }
}

// Sessão completa no formato que o supabase-js guarda no localStorage
// (_isValidSession exige access_token, refresh_token e expires_at).
// Uma sessão nova por página: "Sair" revoga a sessão no servidor.
export async function sessaoDe(emailUsuario) {
  const s = await obterSessaoPorMagicLink(obterChaveServico(), emailUsuario)
  const resposta = await fetch(`${URL_BASE_AUTH}/user`, {
    headers: { apikey: obterApiKey(), Authorization: `Bearer ${s.accessToken}` },
  })
  if (!resposta.ok) throw new Error(`/user falhou para "${emailUsuario}": ${resposta.status}`)
  return {
    access_token: s.accessToken,
    refresh_token: s.refreshToken,
    expires_at: s.expiresAt,
    expires_in: s.expiresIn,
    token_type: s.tokenType,
    user: await resposta.json(),
  }
}
