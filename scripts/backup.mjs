// Backup diario (.github/workflows/backup.yml). Fino de proposito: le o
// ambiente, monta as dependencias reais e chama a orquestracao, que mora em
// scripts/backup/ com testes em testes/backup/. So modulos nativos do Node:
// o workflow nao precisa de npm install. Runbook: docs/runbook-backup.md.
import { lerConfiguracao } from './backup/config.js'
import { criarProvedorToken } from './backup/google-token.js'
import { criarClienteDrive } from './backup/drive.js'
import { criarClienteSupabase } from './backup/supabase.js'
import { criarExecutorDump, argumentosPgDump } from './backup/dump.js'
import { criarHealthchecks } from './backup/healthchecks.js'
import { executarBackup } from './backup/orquestracao.js'

// ::error:: vira anotacao no resumo da execucao no Actions.
const relatarErro = (erro) => console.error(`::error::${erro.message}`)

async function principal(env) {
  let config
  try {
    config = lerConfiguracao(env)
  } catch (erro) {
    relatarErro(erro)
    // Sem configuracao valida nao ha backup; se ao menos a URL do
    // Healthchecks existe, o motivo vai junto com o alerta.
    const pingUrl = String(env.HEALTHCHECKS_PING_URL ?? '').trim().replace(/\/+$/, '')
    if (/^https?:\/\/\S+$/.test(pingUrl)) {
      await criarHealthchecks({ pingUrl }).falha(`Backup falhou (configuracao): ${erro.message}`)
    }
    return 1
  }

  const obterToken = criarProvedorToken(config.google, { urlToken: config.urlGoogleToken })
  try {
    await executarBackup({
      drive: criarClienteDrive({ obterToken, urlApi: config.urlGoogleApi }),
      supabase: criarClienteSupabase({ url: config.supabaseUrl, chaveServico: config.chaveServico }),
      executarDump: criarExecutorDump({ comando: 'pg_dump', argumentos: argumentosPgDump(config.bancoUrl) }),
      healthchecks: criarHealthchecks({ pingUrl: config.pingUrl }),
      agora: () => new Date(),
      pastaId: config.pastaId,
      rota: config.google.rota,
    })
    console.log('Backup concluido.')
    return 0
  } catch (erro) {
    relatarErro(erro)
    return 1
  }
}

process.exitCode = await principal(process.env)
