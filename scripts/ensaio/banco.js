import { spawn, spawnSync } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { createGunzip } from 'node:zlib'

// Acesso ao Postgres da stack LOCAL pelo docker exec (esta maquina nao tem
// psql). Travas: so conteiner supabase_db_*, e so bancos ensaio_restauro_* —
// o banco "postgres" (o dos testes e do app local) nunca e criado, restaurado
// nem apagado por aqui. O projeto hospedado nunca e tocado.

export const CONTEINER_PADRAO = 'supabase_db_marco-1-schema-rls'
const NOME_DE_ENSAIO = /^ensaio_restauro_[a-z0-9_]+$/

function docker(args, opcoes = {}) {
  const r = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opcoes })
  if (r.error) throw new Error(`docker nao encontrado ou falhou: ${r.error.message}`)
  return r
}

function exigirNomeDeEnsaio(nome) {
  if (!NOME_DE_ENSAIO.test(nome)) throw new Error(`Recusado: "${nome}" nao e um banco de ensaio (ensaio_restauro_*).`)
}

export function conferirConteiner(conteiner) {
  if (!/^supabase_db_[\w-]+$/.test(conteiner)) {
    throw new Error(`Recusado: "${conteiner}" nao e o conteiner de banco de uma stack local do Supabase.`)
  }
  const r = docker(['inspect', '-f', '{{.State.Running}}', conteiner])
  if (r.stdout.trim() !== 'true') {
    throw new Error(`O conteiner ${conteiner} nao esta rodando. Suba a stack local: npx supabase start`)
  }
}

export function nomeDoBancoDeEnsaio(agora = new Date()) {
  const carimbo = agora.toISOString().replace(/\D/g, '').slice(0, 14)
  return `ensaio_restauro_${carimbo}_${Math.random().toString(16).slice(2, 6)}`
}

export function criarBanco(conteiner, nome) {
  exigirNomeDeEnsaio(nome)
  const r = docker(['exec', conteiner, 'createdb', '-U', 'postgres', nome])
  if (r.status !== 0) throw new Error(`createdb ${nome} falhou: ${r.stderr}`)
}

export function apagarBanco(conteiner, nome) {
  exigirNomeDeEnsaio(nome)
  const r = docker(['exec', conteiner, 'dropdb', '-U', 'postgres', '--if-exists', '--force', nome])
  if (r.status !== 0) throw new Error(`dropdb ${nome} falhou: ${r.stderr}`)
}

// Restaura o .sql.gz no banco de ensaio e devolve o stderr do psql (onde
// ficam os erros). ON_ERROR_STOP desligado: os dois erros conhecidos nao
// podem interromper a restauracao; o relatorio e que classifica.
export function restaurar(conteiner, nome, caminhoDump) {
  exigirNomeDeEnsaio(nome)
  return new Promise((resolver, rejeitar) => {
    const psql = spawn('docker', ['exec', '-i', conteiner, 'psql', '-U', 'postgres', '-d', nome,
      '-q', '-o', '/dev/null', '-v', 'ON_ERROR_STOP=0'], { stdio: ['pipe', 'ignore', 'pipe'] })
    let erros = ''
    psql.stderr.on('data', (p) => { erros += p })
    psql.on('error', rejeitar)
    psql.on('close', (codigo) => (codigo === 0 ? resolver(erros)
      : rejeitar(new Error(`psql terminou com codigo ${codigo}: ${erros.slice(-2000)}`))))
    const gunzip = createGunzip()
    gunzip.on('error', (e) => {
      psql.kill()
      rejeitar(new Error(`O dump nao e um gzip valido (download incompleto?): ${e.message}`))
    })
    createReadStream(caminhoDump).on('error', rejeitar).pipe(gunzip).pipe(psql.stdin)
  })
}

// Consulta que devolve UM valor JSON.
export function consultarJson(conteiner, nome, sql) {
  exigirNomeDeEnsaio(nome)
  const r = docker(['exec', conteiner, 'psql', '-U', 'postgres', '-d', nome, '-X', '-At', '-v', 'ON_ERROR_STOP=1',
    '-c', sql])
  if (r.status !== 0) throw new Error(`consulta no banco de ensaio falhou: ${r.stderr}`)
  return JSON.parse(r.stdout)
}
