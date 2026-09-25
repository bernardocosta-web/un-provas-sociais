// Logica pura do ensaio de restauracao: classificar os erros do psql,
// comparar os arquivos baixados com os metadados do Storage, decidir o
// veredito e montar o relatorio. Sem I/O (testes/ensaio/analise.test.js).

// Os dois erros que a restauracao do dump SEMPRE da num banco novo da stack
// local, e por que nao importam.
const ERROS_CONHECIDOS = [
  {
    padrao: /permission denied for table secrets/,
    motivo: 'Vault (vault.secrets): o dump traz a tabela de segredos do Vault do Supabase, que so o ' +
      'papel interno do Supabase pode gravar. O projeto nao usa o Vault; nenhum dado do app se perde.',
  },
  {
    padrao: /permission denied to set parameter "log_min_messages"/,
    motivo: 'Configuracao de log gravada no dump pelo Supabase; so o superusuario da plataforma pode ' +
      'muda-la. Nao afeta dado nenhum.',
  },
]

export function classificarErros(texto) {
  const conhecidos = []
  const inesperados = []
  for (const linha of String(texto).split(/\r?\n/)) {
    if (!/\b(ERROR|FATAL):/.test(linha)) continue
    const conhecido = ERROS_CONHECIDOS.find((e) => e.padrao.test(linha))
    if (conhecido) conhecidos.push({ linha, motivo: conhecido.motivo })
    else inesperados.push(linha)
  }
  return { conhecidos, inesperados }
}

// metadados: linhas de storage.objects do banco restaurado; noDisco: arquivos
// da pasta baixada do Drive. Ao baixar, o Drive pode trocar "/" do nome por
// "_": as duas formas contam.
export function compararArquivos(metadados, noDisco) {
  const disco = new Set(noDisco.map((a) => `${a.bucket}/${a.caminho}`))
  const usados = new Set()
  const faltando = []
  for (const m of metadados) {
    const formas = [`${m.bucket}/${m.caminho}`, `${m.bucket}/${m.caminho.replaceAll('/', '_')}`]
    const achada = formas.find((f) => disco.has(f))
    if (achada) usados.add(achada)
    else faltando.push(formas[0])
  }
  return {
    faltando: faltando.sort(),
    extras: [...disco].filter((d) => !usados.has(d)).sort(),
    presentes: metadados.length - faltando.length,
    metadados: metadados.length,
    noDisco: disco.size,
  }
}

export function veredito(d) {
  const problemas = []
  if (d.erros.inesperados.length) {
    problemas.push(`${d.erros.inesperados.length} erro(s) inesperado(s) na restauracao (ver abaixo).`)
  }
  if (d.contagens.depoimento === undefined) problemas.push('A tabela public.depoimento nao voltou.')
  if (!d.membrosAtivos) problemas.push('Nenhum membro ativo em membro_equipe: ninguem conseguiria entrar.')
  if (d.arquivos.faltando.length) {
    problemas.push(`${d.arquivos.faltando.length} arquivo(s) do Storage sem copia na pasta baixada.`)
  }
  if (d.printsSemArquivo.length) {
    problemas.push(`${d.printsSemArquivo.length} print(s) citado(s) em depoimento.print_path sem arquivo.`)
  }
  return { ok: problemas.length === 0, problemas }
}

const lista = (itens, limite = 20) => [
  ...itens.slice(0, limite).map((i) => `    - ${i}`),
  ...(itens.length > limite ? [`    ... e mais ${itens.length - limite}`] : []),
]

export function formatarRelatorio(d) {
  const largura = Math.max(...Object.keys(d.contagens).map((t) => t.length), 10)
  const a = d.amostra
  return [
    `Ensaio de restauracao de ${d.dump}`,
    '',
    'Linhas por tabela (public):',
    ...Object.entries(d.contagens).map(([t, n]) => `  ${t.padEnd(largura)}  ${n}`),
    '',
    `membro_equipe: ${d.contagens.membro_equipe ?? 0} linha(s), ${d.membrosAtivos} ativo(s)`,
    a ? `Depoimento de amostra: #${a.id} "${a.texto}" — ${a.participacoes} participacao(oes), ` +
      `${a.notas} nota(s), ${a.resultados} resultado(s)` : 'Depoimento de amostra: nenhum depoimento no dump',
    '',
    `Arquivos: ${d.arquivos.presentes} de ${d.arquivos.metadados} objeto(s) do Storage com copia na pasta ` +
      `(${d.arquivos.noDisco} arquivo(s) no disco)`,
    ...(d.arquivos.faltando.length ? ['  Sem copia:', ...lista(d.arquivos.faltando)] : []),
    ...(d.printsSemArquivo.length ? ['  Prints citados em depoimento sem arquivo:', ...lista(d.printsSemArquivo)] : []),
    ...(d.arquivos.extras.length ? [`  Arquivos a mais (versoes antigas ou removidos do bucket; normal): ` +
      `${d.arquivos.extras.length}`] : []),
    '',
    `Erros da restauracao: ${d.erros.conhecidos.length} conhecido(s) e inofensivo(s), ` +
      `${d.erros.inesperados.length} inesperado(s)`,
    ...d.erros.conhecidos.map((e) => `  [ok] ${e.linha}\n       ${e.motivo}`),
    ...d.erros.inesperados.slice(0, 50).map((l) => `  [!!] ${l}`),
    '',
    d.veredito.ok ? 'ENSAIO OK' : 'ENSAIO REPROVADO',
    ...d.veredito.problemas.map((p) => `  - ${p}`),
    '',
    d.mantido
      ? `Banco de ensaio ${d.banco} mantido para inspecao. Para apagar: ` +
        `docker exec <conteiner> dropdb -U postgres --force ${d.banco}`
      : `banco de ensaio ${d.banco} apagado.`,
  ].join('\n')
}
