import { spawn } from 'node:child_process'
import { createGzip } from 'node:zlib'
import { ErroBackup } from './erros.js'

// Roda o pg_dump (ou outro comando que imprima um dump SQL no stdout) e
// devolve a saida comprimida em gzip. O comando e injetado: no CI e o
// pg_dump 17 do runner; nos testes, o pg_dump 17 de dentro do conteiner da
// stack local (docker exec). Dump sem o rodape "dump complete" e recusado:
// um dump cortado no meio nao pode passar por backup.

const RODAPE = '-- PostgreSQL database dump complete'

// A senha sai da URL e vai por PGPASSWORD: na linha de comando ela ficaria
// visivel na lista de processos do runner.
export function configurarPgDump(bancoUrl) {
  const url = new URL(bancoUrl)
  const senha = decodeURIComponent(url.password)
  url.password = ''
  return {
    argumentos: ['--no-owner', '--no-acl', '--dbname', url.toString()],
    env: senha ? { PGPASSWORD: senha } : {},
  }
}

// Um pg_dump travado (pooler que nao responde) falharia so no timeout do job,
// sem motivo. Aqui ele e morto no tempo limite, com mensagem.
const DEZ_MINUTOS = 10 * 60 * 1000

export function criarExecutorDump({ comando = 'pg_dump', argumentos, env = {}, tempoLimiteMs = DEZ_MINUTOS }) {
  return () => new Promise((resolver, rejeitar) => {
    const falhar = (mensagem, causa) => {
      clearTimeout(relogio)
      rejeitar(new ErroBackup(mensagem, { etapa: 'dump do banco', causa }))
    }
    const processo = spawn(comando, argumentos, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } })
    const relogio = setTimeout(() => {
      processo.kill('SIGKILL')
      falhar(`pg_dump passou do tempo limite (${Math.round(tempoLimiteMs / 1000)} s) e foi interrompido. ` +
        'Confira se o Session pooler do Supabase esta respondendo (SUPABASE_DB_URL) e rode de novo.')
    }, tempoLimiteMs)
    const gzip = createGzip()
    const comprimido = []
    let fim = ''
    let erroPadrao = ''
    let codigo = null
    let pendentes = 2 // saida do processo + fim do gzip

    const concluir = () => {
      if (--pendentes > 0) return
      clearTimeout(relogio)
      if (codigo !== 0) {
        return falhar(`${comando === 'pg_dump' ? 'pg_dump' : `pg_dump (${comando})`} terminou com ` +
          `codigo ${codigo}: ${erroPadrao.trim().slice(-1000)}. Confira SUPABASE_DB_URL (URI do ` +
          'Session pooler) e a versao do pg_dump (tem de ser 17).')
      }
      if (!fim.includes(RODAPE)) {
        return falhar('Dump incompleto: a saida do pg_dump nao terminou com ' +
          `"${RODAPE}". ${erroPadrao.trim().slice(-500)}`)
      }
      resolver(Buffer.concat(comprimido))
    }

    processo.on('error', (erro) => {
      if (erro.code === 'ENOENT') {
        falhar(`pg_dump nao encontrado ("${comando}"). No workflow, o passo que instala o ` +
          'postgresql-client-17 tem de rodar antes.', erro)
      } else {
        falhar(`Nao foi possivel rodar o pg_dump: ${erro.message}`, erro)
      }
    })
    processo.stdout.on('data', (pedaco) => {
      fim = (fim + pedaco.toString('utf8')).slice(-200)
    })
    processo.stdout.pipe(gzip)
    gzip.on('data', (pedaco) => comprimido.push(pedaco))
    gzip.on('end', concluir)
    processo.stderr.on('data', (pedaco) => {
      erroPadrao = (erroPadrao + pedaco.toString('utf8')).slice(-4000)
    })
    processo.on('close', (c) => {
      codigo = c
      concluir()
    })
  })
}
