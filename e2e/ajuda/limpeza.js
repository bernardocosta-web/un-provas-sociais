// Limpeza dos e2e: apaga tudo com o prefixo "E2E-" (também de execuções
// interrompidas, que tinham outro marcador) e os usuários "e2e-...".
// Arquivos saem pela Storage API com a service key — o Storage proíbe
// apagar storage.objects por SQL. Os arquivos são achados por dois
// caminhos: os referenciados pelas linhas marcadas (logo_path/print_path) e
// todos os enviados por um usuário e2e (owner_id), o que pega também um
// órfão que a app tenha deixado.
import { obterChaveServico, deletarUsuarioAdmin } from '../../testes/auth/ajuda.js'
import { conectar } from '../../testes/rls/ajuda.js'
import { ambienteLocal } from './ambiente.js'
import { PREFIXO_MARCADOR } from './marcador.js'
import { PREFIXO_EMAIL } from './usuarios.js'

const MARCA = `${PREFIXO_MARCADOR}%`
const EMAILS = `${PREFIXO_EMAIL}%@exemplo.test`

// Ordem que respeita as FKs "restrict": depoimento (leva participacao, nota,
// resultado, tipos e canais em cascata) antes de prova/materia/instituicao.
const APAGAR_LINHAS = [
  ['depoimento', 'texto_completo'],
  ['aluno', 'nome_exibicao'],
  ['prova', 'nome'],
  ['curso', 'nome'],
  ['materia', 'nome'],
  ['instituicao_apelido', 'apelido'],
  ['instituicao', 'nome_canonico'],
]

async function idsUsuariosE2e(cliente) {
  const { rows } = await cliente.query('select id::text from auth.users where email like $1', [EMAILS])
  return rows.map((r) => r.id)
}

async function arquivosE2e(cliente, ids) {
  const { rows } = await cliente.query(`
    select bucket_id, name from storage.objects o
    where bucket_id in ('logos', 'prints')
      and (owner_id = any($2::text[])
        or (bucket_id = 'logos' and name in (
              select logo_path from instituicao where nome_canonico like $1))
        or (bucket_id = 'prints' and name in (
              select print_path from depoimento where texto_completo like $1)))`,
  [MARCA, ids])
  return rows
}

async function apagarArquivos(arquivos) {
  const { url } = ambienteLocal()
  const chave = obterChaveServico()
  for (const bucket of ['logos', 'prints']) {
    const nomes = arquivos.filter((a) => a.bucket_id === bucket).map((a) => a.name)
    if (!nomes.length) continue
    const resposta = await fetch(`${url}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: nomes }),
    })
    if (!resposta.ok) {
      throw new Error(`Storage recusou apagar ${bucket}: ${resposta.status} ${await resposta.text()}`)
    }
  }
}

// Linhas e arquivos marcados; os usuários ficam (afterAll de cada arquivo).
export async function limparDados() {
  const cliente = await conectar()
  try {
    await apagarArquivos(await arquivosE2e(cliente, await idsUsuariosE2e(cliente)))
    for (const [tabela, coluna] of APAGAR_LINHAS) {
      await cliente.query(`delete from ${tabela} where ${coluna} like $1`, [MARCA])
    }
  } finally {
    await cliente.end()
  }
}

// Tudo: dados, arquivos, membro_equipe e os usuários de auth
// (globalSetup, para sobras antigas, e globalTeardown).
export async function limparTudo() {
  await limparDados()
  const cliente = await conectar()
  try {
    await cliente.query('delete from membro_equipe where email like $1', [EMAILS])
    const ids = await idsUsuariosE2e(cliente)
    // Arquivo de um usuário que vai sumir não seria mais achado por owner_id.
    const restantes = await arquivosE2e(cliente, ids)
    if (restantes.length) throw new Error(`Arquivos e2e sobraram: ${JSON.stringify(restantes)}`)
    const chave = obterChaveServico()
    for (const id of ids) await deletarUsuarioAdmin(chave, id)
  } finally {
    await cliente.end()
  }
}

// Contagem do que ainda tem o marcador (deve ser tudo zero ao fim).
export async function contarSobras() {
  const cliente = await conectar()
  try {
    const sobras = {}
    for (const [tabela, coluna] of APAGAR_LINHAS) {
      const { rows } = await cliente.query(
        `select count(*)::int as n from ${tabela} where ${coluna} like $1`, [MARCA])
      sobras[tabela] = rows[0].n
    }
    const ids = await idsUsuariosE2e(cliente)
    sobras.arquivos = (await arquivosE2e(cliente, ids)).length
    sobras.usuarios = ids.length
    const { rows } = await cliente.query(
      'select count(*)::int as n from membro_equipe where email like $1', [EMAILS])
    sobras.membro_equipe = rows[0].n
    return sobras
  } finally {
    await cliente.end()
  }
}
