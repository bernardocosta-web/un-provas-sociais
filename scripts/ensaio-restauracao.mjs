// Ensaio de restauracao do backup na stack LOCAL (Task 24). Uso:
//
//   npm run ensaio:restauracao -- --dump backups/ensaio/banco-AAAA-MM-DD.sql.gz \
//     --arquivos backups/ensaio/arquivos [--manter]
//
// Restaura o dump num banco novo e descartavel (ensaio_restauro_*) do
// conteiner local, confere e imprime o relatorio; sai com 0 se o ensaio
// passou, 1 se reprovou. --manter deixa o banco para inspecao. Nunca toca o
// banco "postgres" local nem o projeto hospedado. Passo a passo:
// docs/runbook-backup.md, "Ensaio de restauracao".
import { parseArgs } from 'node:util'
import { executarEnsaio } from './ensaio/ensaio.js'
import { formatarRelatorio } from './ensaio/analise.js'

let opcoes
try {
  ({ values: opcoes } = parseArgs({
    options: {
      dump: { type: 'string' },
      arquivos: { type: 'string' },
      manter: { type: 'boolean', default: false },
      conteiner: { type: 'string' },
      prefixo: { type: 'string', default: '' },
    },
  }))
  if (!opcoes.dump || !opcoes.arquivos) throw new Error('faltam --dump e/ou --arquivos')
} catch (erro) {
  console.error(`Uso: npm run ensaio:restauracao -- --dump <banco-AAAA-MM-DD.sql.gz> --arquivos <pasta com prints/ e logos/> [--manter]\n(${erro.message})`)
  process.exit(2)
}

try {
  const dados = await executarEnsaio({ ...opcoes, registrar: (m) => console.log(m) })
  console.log(`\n${formatarRelatorio(dados)}`)
  process.exitCode = dados.veredito.ok ? 0 : 1
} catch (erro) {
  console.error(`Ensaio interrompido: ${erro.message}`)
  process.exitCode = 1
}
