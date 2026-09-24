// Sugestao e busca de aluno para a ficha. Logica pura: recebe a lista de
// alunos ja carregada ({ id, nome_exibicao, perfis: [{ identificador }] }).
import { normalizar } from './instituicoes.js'

// '@ana.exemplo' e 'ana.exemplo' sao o mesmo perfil.
function identificador(texto) {
  return normalizar(texto).replace(/^@+/, '')
}

// Procura aluno cujo identificador de perfil seja IGUAL ao autor ou ao
// contato (como vieram da fonte). Nunca compara com nome_exibicao: nomes se
// repetem. Devolve candidatos; quem liga e a pessoa, com um clique.
export function sugerirAlunos(autorBruto, autorContatoBruto, alunos) {
  const alvos = [autorBruto, autorContatoBruto].map(identificador).filter(Boolean)
  if (!alvos.length) return []
  return alunos.filter((aluno) =>
    (aluno.perfis ?? []).some((p) => alvos.includes(identificador(p.identificador))))
}

// Busca manual: trecho do nome de exibicao ou de algum identificador.
export function buscarAlunos(alunos, termo, limite = 8) {
  const alvo = identificador(termo)
  if (!alvo) return []
  return alunos.filter((aluno) =>
    normalizar(aluno.nome_exibicao).includes(alvo)
    || (aluno.perfis ?? []).some((p) => identificador(p.identificador).includes(alvo)))
    .slice(0, limite)
}
