import { supabase } from './cliente.js'
import { sugerirAlunos } from '../lib/alunos.js'

export async function listarAlunos() {
  const { data, error } = await supabase
    .from('aluno')
    .select('id, nome_exibicao, aluno_perfil(plataforma, identificador, url)')
    .order('nome_exibicao')
  if (error) throw error
  return data.map(({ aluno_perfil, ...aluno }) => ({ ...aluno, perfis: aluno_perfil ?? [] }))
}

// perfis: [{ plataforma, identificador, url? }]. Duas chamadas (aluno, depois
// perfis): se os perfis falharem, o aluno recem-criado e apagado para nao
// ficar um cadastro pela metade; o erro original segue para quem chamou.
export async function criarAluno(nome, perfis = []) {
  const { data: aluno, error } = await supabase
    .from('aluno').insert({ nome_exibicao: nome.trim() })
    .select('id, nome_exibicao').single()
  if (error) throw error
  const linhas = perfis
    .filter((p) => p.identificador?.trim())
    .map((p) => ({
      aluno_id: aluno.id, plataforma: p.plataforma,
      identificador: p.identificador.trim(), url: p.url?.trim() || null,
    }))
  if (!linhas.length) return { ...aluno, perfis: [] }
  const { data: gravados, error: erroPerfis } = await supabase
    .from('aluno_perfil').insert(linhas).select('plataforma, identificador, url')
  if (erroPerfis) {
    const { error: erroLimpeza } = await supabase.from('aluno').delete().eq('id', aluno.id)
    if (erroLimpeza) console.warn('Aluno criado sem perfil ficou no banco:', erroLimpeza.message)
    throw erroPerfis
  }
  return { ...aluno, perfis: gravados }
}

// Conveniencia do brief: busca a lista e aplica a regra pura
// (src/lib/alunos.js). O SeletorAluno ja tem a lista carregada e chama a
// regra direto, sem nova consulta a cada tecla.
export async function sugerirAluno(autorBruto, autorContatoBruto) {
  return sugerirAlunos(autorBruto, autorContatoBruto, await listarAlunos())
}
