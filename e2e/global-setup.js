// Antes de tudo: apaga sobras de execuções interrompidas (qualquer "E2E-%"
// e usuário "e2e-...") e cria os dois usuários desta execução.
import { conectar } from '../testes/rls/ajuda.js'
import { limparTudo } from './ajuda/limpeza.js'
import { criarUsuarios } from './ajuda/usuarios.js'

export default async function globalSetup() {
  await limparTudo()
  await criarUsuarios()
  // ENEM é cadastro canônico compartilhado com as suítes de RLS, que o criam
  // do mesmo jeito (upsert) e nunca o apagam: a escala TRI por padrão depende
  // do nome ser exatamente "ENEM", então ele não leva o marcador.
  const cliente = await conectar()
  try {
    await cliente.query(
      `insert into prova (nome) values ('ENEM') on conflict (nome) do nothing`)
  } finally {
    await cliente.end()
  }
}
