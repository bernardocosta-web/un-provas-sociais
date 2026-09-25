import { describe, it, expect } from 'vitest'
import { gunzipSync } from 'node:zlib'
import { criarExecutorDump, configurarPgDump } from '../../scripts/backup/dump.js'

// O executor roda um comando qualquer e comprime a saida. Aqui o "pg_dump" e
// o proprio node imprimindo um dump de mentira; o de verdade (pg_dump 17 do
// conteiner local) roda em integracao.test.js.
const node = (codigo) => criarExecutorDump({ comando: process.execPath, argumentos: ['-e', codigo] })
const RODAPE = '--\\n-- PostgreSQL database dump complete\\n--\\n'

describe('criarExecutorDump', () => {
  it('comprime a saida em gzip, byte a byte igual', async () => {
    const texto = `-- PostgreSQL database dump\\nCOPY public.curso (id) FROM stdin;\\n1\\n\\\\.\\n${RODAPE}`
    const gz = await node(`process.stdout.write("${texto}")`)()
    expect(gz[0]).toBe(0x1f) // magic number do gzip
    expect(gz[1]).toBe(0x8b)
    const sql = gunzipSync(gz).toString('utf8')
    expect(sql).toContain('COPY public.curso (id) FROM stdin;')
    expect(sql.endsWith('-- PostgreSQL database dump complete\n--\n')).toBe(true)
  })

  it('saida grande (varios chunks) chega inteira', async () => {
    const gz = await node(`for (let i = 0; i < 20000; i++) process.stdout.write("linha " + i + "\\n");` +
      `process.stdout.write("${RODAPE}")`)()
    const sql = gunzipSync(gz).toString('utf8')
    expect(sql.split('\n').filter((l) => l.startsWith('linha '))).toHaveLength(20000)
  })

  it('codigo de saida diferente de zero: falha com o stderr', async () => {
    const executar = node('process.stderr.write("pg_dump: error: connection refused"); process.exit(1)')
    await expect(executar()).rejects.toThrow(/pg_dump.*codigo 1.*connection refused/s)
  })

  it('dump sem o rodape "dump complete" (cortado no meio) e recusado', async () => {
    const executar = node('process.stdout.write("-- PostgreSQL database dump\\nCOPY public.x")')
    await expect(executar()).rejects.toThrow(/incompleto/)
  })

  it('comando inexistente: diz que o pg_dump nao foi encontrado', async () => {
    const executar = criarExecutorDump({ comando: 'comando-que-nao-existe-xyz', argumentos: [] })
    await expect(executar()).rejects.toThrow(/nao encontrado/)
  })

  it('pg_dump sem dono e sem ACL; a senha vai por PGPASSWORD, nunca na linha de comando', () => {
    const { argumentos, env } = configurarPgDump(
      'postgresql://postgres.ref:se%40nha%3Fx@pooler.exemplo.test:5432/postgres')
    expect(argumentos).toEqual(['--no-owner', '--no-acl', '--dbname',
      'postgresql://postgres.ref@pooler.exemplo.test:5432/postgres'])
    expect(argumentos.join(' ')).not.toContain('nha')
    expect(env).toEqual({ PGPASSWORD: 'se@nha?x' })
  })

  it('URL sem senha: nada em PGPASSWORD', () => {
    expect(configurarPgDump('postgresql://u@h:5432/db')).toEqual({
      argumentos: ['--no-owner', '--no-acl', '--dbname', 'postgresql://u@h:5432/db'], env: {} })
  })

  it('o ambiente extra (PGPASSWORD) chega ao processo do dump', async () => {
    const executar = criarExecutorDump({ comando: process.execPath, env: { PGPASSWORD: 'segredo-x' },
      argumentos: ['-e', `process.stdout.write("senha=" + process.env.PGPASSWORD + "\\n${RODAPE}")`] })
    expect(gunzipSync(await executar()).toString()).toContain('senha=segredo-x')
  })

  it('pg_dump travado: morto no tempo limite, com motivo claro', async () => {
    const inicio = Date.now()
    const executar = criarExecutorDump({ comando: process.execPath,
      argumentos: ['-e', 'setInterval(() => {}, 1000)'], tempoLimiteMs: 300 })
    await expect(executar()).rejects.toThrow(/passou do tempo limite/)
    expect(Date.now() - inicio).toBeLessThan(10_000)
  })
})
