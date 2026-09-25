import { describe, it, expect } from 'vitest'
import {
  classificarErros, compararArquivos, veredito, formatarRelatorio,
} from '../../scripts/ensaio/analise.js'

const STDERR = [
  'psql:<stdin>:12: NOTICE:  extension "pgcrypto" already exists, skipping',
  'psql:<stdin>:4021: ERROR:  permission denied for table secrets',
  'psql:<stdin>:15: ERROR:  permission denied to set parameter "log_min_messages"',
  'psql:<stdin>:900: ERROR:  relation "public.tabela_que_nao_existe" does not exist',
  '',
].join('\r\n')

describe('classificarErros', () => {
  it('separa os dois erros conhecidos e inofensivos dos inesperados; ignora NOTICE', () => {
    const { conhecidos, inesperados } = classificarErros(STDERR)
    expect(conhecidos.map((e) => e.linha)).toEqual([
      'psql:<stdin>:4021: ERROR:  permission denied for table secrets',
      'psql:<stdin>:15: ERROR:  permission denied to set parameter "log_min_messages"',
    ])
    expect(conhecidos[0].motivo).toMatch(/Vault/)
    expect(conhecidos[1].motivo).toMatch(/log/)
    expect(inesperados).toEqual(['psql:<stdin>:900: ERROR:  relation "public.tabela_que_nao_existe" does not exist'])
  })

  it('FATAL tambem e inesperado; saida vazia nao tem erro', () => {
    expect(classificarErros('psql: FATAL:  database "x" does not exist').inesperados).toHaveLength(1)
    expect(classificarErros('')).toEqual({ conhecidos: [], inesperados: [] })
  })
})

describe('compararArquivos', () => {
  const metadados = [
    { bucket: 'prints', caminho: 'a.webp' },
    { bucket: 'prints', caminho: 'pasta/b.webp' },
    { bucket: 'logos', caminho: 'l.png' },
  ]

  it('casa bucket + caminho; aceita "/" trocada por "_" (como o Drive grava ao baixar)', () => {
    const r = compararArquivos(metadados, [
      { bucket: 'prints', caminho: 'a.webp' },
      { bucket: 'prints', caminho: 'pasta_b.webp' },
      { bucket: 'logos', caminho: 'l.png' },
      { bucket: 'logos', caminho: 'versao-antiga.png' },
    ])
    expect(r.faltando).toEqual([])
    expect(r.presentes).toBe(3)
    expect(r.extras).toEqual(['logos/versao-antiga.png'])
  })

  it('arquivo do Storage sem copia no disco aparece em faltando; bucket errado nao conta', () => {
    const r = compararArquivos(metadados, [{ bucket: 'logos', caminho: 'a.webp' }])
    expect(r.faltando).toEqual(['logos/l.png', 'prints/a.webp', 'prints/pasta/b.webp'])
  })
})

function dadosOk(extra = {}) {
  return {
    banco: 'ensaio_restauro_x', dump: 'banco-2026-09-26.sql.gz', mantido: false,
    erros: { conhecidos: [], inesperados: [] },
    contagens: { depoimento: 3, membro_equipe: 2, participacao: 4 },
    membrosAtivos: 2,
    amostra: { id: 7, texto: 'Passei!', participacoes: 2, notas: 3, resultados: 1 },
    arquivos: { faltando: [], extras: [], presentes: 5, metadados: 5, noDisco: 5 },
    printsSemArquivo: [],
    ...extra,
  }
}

describe('veredito', () => {
  it('tudo certo: ok, sem problemas', () => {
    expect(veredito(dadosOk())).toEqual({ ok: true, problemas: [] })
  })

  it.each([
    ['erro inesperado', { erros: { conhecidos: [], inesperados: ['ERROR: x'] } }, /1 erro\(s\) inesperado/],
    ['sem tabela depoimento', { contagens: { membro_equipe: 1 } }, /depoimento/],
    ['nenhum membro ativo', { membrosAtivos: 0 }, /membro_equipe/],
    ['arquivo faltando', { arquivos: { faltando: ['prints/a'], extras: [], presentes: 0, metadados: 1, noDisco: 0 } }, /1 arquivo/],
    ['print citado sem arquivo', { printsSemArquivo: ['a.webp'] }, /print_path/],
  ])('%s reprova', (nome, extra, padrao) => {
    const v = veredito(dadosOk(extra))
    expect(v.ok).toBe(false)
    expect(v.problemas.join('\n')).toMatch(padrao)
  })

  it('erros conhecidos nao reprovam', () => {
    expect(veredito(dadosOk({ erros: { conhecidos: [{ linha: 'x', motivo: 'y' }], inesperados: [] } })).ok).toBe(true)
  })
})

describe('formatarRelatorio', () => {
  it('traz contagens, membros, amostra, arquivos, erros e o veredito', () => {
    const dados = dadosOk({ erros: { conhecidos: [{ linha: 'ERROR: permission denied for table secrets', motivo: 'Vault: inofensivo' }], inesperados: [] } })
    dados.veredito = veredito(dados)
    const texto = formatarRelatorio(dados)
    expect(texto).toMatch(/depoimento\s+3/)
    expect(texto).toMatch(/membro_equipe.*2 ativo/)
    expect(texto).toMatch(/#7.*2 participa.*3 nota.*1 resultado/s)
    expect(texto).toMatch(/5 de 5/)
    expect(texto).toMatch(/Vault: inofensivo/)
    expect(texto).toMatch(/ENSAIO OK/)
    expect(texto).toMatch(/banco de ensaio ensaio_restauro_x apagado/)
  })

  it('reprovado: lista os problemas; mantido: diz como apagar depois', () => {
    const dados = dadosOk({ membrosAtivos: 0, mantido: true })
    dados.veredito = veredito(dados)
    const texto = formatarRelatorio(dados)
    expect(texto).toMatch(/ENSAIO REPROVADO/)
    expect(texto).toMatch(/membro_equipe/)
    expect(texto).toMatch(/dropdb .*ensaio_restauro_x/)
  })
})
