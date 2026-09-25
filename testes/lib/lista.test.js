import { describe, it, expect } from 'vitest'
import {
  ABAS, colunasDaAba, linhaDaLista, textoContagem, trecho, dataBr,
} from '../../src/lib/lista.js'
import { FONTES } from '../../src/lib/rotulos.js'

describe('ABAS', () => {
  it('Todos, Google, Forms, Manual — valor e o da aba em estado/URL', () => {
    expect(ABAS.map((a) => a.rotulo)).toEqual(['Todos', 'Google', 'Forms', 'Manual'])
    expect(ABAS.map((a) => a.valor)).toEqual(['TODOS', 'GOOGLE_REVIEW', 'GOOGLE_FORMS', 'MANUAL'])
  })

  it('toda aba de fonte e um valor do enum fonte_depoimento', () => {
    const fontes = FONTES.map((f) => f.valor)
    for (const aba of ABAS.slice(1)) expect(fontes).toContain(aba.valor)
  })
})

describe('colunasDaAba', () => {
  const chaves = (aba) => colunasDaAba(aba).map((c) => c.chave)
  const destaques = (aba) => colunasDaAba(aba).filter((c) => c.destaque).map((c) => c.chave)

  it('Todos: fonte, autor, resumo, tipos, logos, status e data', () => {
    expect(chaves('TODOS')).toEqual(['fonte', 'autor', 'resumo', 'tipos', 'logos', 'status', 'data'])
  })

  it('autorizacao aparece so na aba Forms, e em destaque', () => {
    for (const aba of ['TODOS', 'GOOGLE_REVIEW', 'MANUAL']) {
      expect(chaves(aba)).not.toContain('autorizacao')
    }
    expect(chaves('GOOGLE_FORMS')).toContain('autorizacao')
    expect(destaques('GOOGLE_FORMS')).toContain('autorizacao')
  })

  it('Google destaca autor, texto, link original e data', () => {
    expect(destaques('GOOGLE_REVIEW')).toEqual(['autor', 'texto', 'link', 'data'])
  })

  it('Forms destaca nome, autorizacao, @ e depoimento', () => {
    expect(destaques('GOOGLE_FORMS')).toEqual(['autor', 'autorizacao', 'contato', 'texto'])
    expect(colunasDaAba('GOOGLE_FORMS').find((c) => c.chave === 'autor').titulo).toBe('Nome')
  })

  it('Todos nao destaca nada; toda aba mostra tipos, logos e status', () => {
    expect(destaques('TODOS')).toEqual([])
    for (const { valor } of ABAS) {
      expect(chaves(valor)).toEqual(expect.arrayContaining(['tipos', 'logos', 'status']))
    }
  })

  it('aba desconhecida cai nas colunas de Todos', () => {
    expect(colunasDaAba('LIXO')).toEqual(colunasDaAba('TODOS'))
  })
})

describe('linhaDaLista', () => {
  const DEPOIMENTO = {
    id: 9,
    texto_completo: 'Gabaritei fisica e passei no ITA',
    resumo_curto: null,
    autor_bruto: 'Fulana',
    autor_contato_bruto: '@fulana',
    fonte: 'GOOGLE_FORMS',
    link_original: 'https://exemplo.test/x',
    data_depoimento: '2025-03-07',
    autorizacao_publicacao: 'AUTORIZADO',
    status_uso: 'DISPONIVEL',
    depoimento_tipo: [{ tipo: 'APROVACAO' }, { tipo: 'ELOGIO' }],
    participacao: [
      { resultado: [
        { situacao: 'APROVADO', instituicao: { id: 1, nome_canonico: 'ITA', logo_path: 'ita.webp' } },
        { situacao: 'NAO_APROVADO', instituicao: { id: 2, nome_canonico: 'IME', logo_path: 'ime.webp' } },
      ] },
      { resultado: [
        { situacao: 'APROVADO', instituicao: { id: 1, nome_canonico: 'ITA', logo_path: 'ita.webp' } },
        { situacao: 'APROVADO', instituicao: { id: 3, nome_canonico: 'UFMG', logo_path: null } },
      ] },
      { resultado: [] },
    ],
  }

  it('monta a linha com rotulos pt-BR', () => {
    const linha = linhaDaLista(DEPOIMENTO)
    expect(linha).toMatchObject({
      id: 9,
      autor: 'Fulana',
      contato: '@fulana',
      fonte: 'Google Forms',
      link: 'https://exemplo.test/x',
      data: '07/03/2025',
      autorizacao: 'Autorizado',
      status: 'Disponível',
      tipos: ['Aprovação', 'Elogio'],
    })
  })

  it('instituicoes: so as aprovadas, sem repetir, na ordem em que aparecem', () => {
    expect(linhaDaLista(DEPOIMENTO).instituicoes).toEqual([
      { id: 1, nome: 'ITA', logo_path: 'ita.webp' },
      { id: 3, nome: 'UFMG', logo_path: null },
    ])
  })

  it('resumo: resumo_curto quando existe, senao trecho do texto', () => {
    expect(linhaDaLista(DEPOIMENTO).resumo).toBe('Gabaritei fisica e passei no ITA')
    expect(linhaDaLista({ ...DEPOIMENTO, resumo_curto: '  Curto  ' }).resumo).toBe('Curto')
  })

  it('campos ausentes nao quebram (linha sem embedding, link em branco)', () => {
    const linha = linhaDaLista({
      id: 1, texto_completo: 'x', fonte: 'MANUAL', status_uso: 'FEITO',
      autorizacao_publicacao: 'NAO_INFORMADO', link_original: '  ',
    })
    expect(linha).toMatchObject({
      autor: '', contato: '', link: '', data: '', tipos: [], instituicoes: [], status: 'Feito',
    })
  })
})

describe('trecho / dataBr / textoContagem', () => {
  it('trecho corta com reticencias sem passar do limite', () => {
    expect(trecho('abc', 5)).toBe('abc')
    expect(trecho('abcdefghij', 5)).toBe('abcd…')
    expect(trecho(null, 5)).toBe('')
  })

  it('dataBr: aaaa-mm-dd -> dd/mm/aaaa; lixo vira vazio', () => {
    expect(dataBr('2025-12-31')).toBe('31/12/2025')
    expect(dataBr(null)).toBe('')
    expect(dataBr('ontem')).toBe('')
  })

  it('contagem no singular e no plural', () => {
    expect(textoContagem(0)).toBe('0 depoimentos')
    expect(textoContagem(1)).toBe('1 depoimento')
    expect(textoContagem(42)).toBe('42 depoimentos')
  })
})

// Fix round 1 (seguranca): link_original vira href; um "javascript:" gravado
// executaria na origem da app (com a sessao). So http(s) vira link.
describe('linhaDaLista: link so para http(s)', () => {
  const base = { id: 1, texto_completo: 'x', fonte: 'GOOGLE_REVIEW', status_uso: 'DISPONIVEL' }
  it('http e https (qualquer caixa) viram href', () => {
    expect(linhaDaLista({ ...base, link_original: 'https://exemplo.test/a' }).href).toBe('https://exemplo.test/a')
    expect(linhaDaLista({ ...base, link_original: ' HTTP://exemplo.test ' }).href).toBe('HTTP://exemplo.test')
  })
  it('javascript:, data: e texto solto nao viram href, mas o texto aparece', () => {
    for (const link of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,x', 'exemplo.test/a']) {
      const linha = linhaDaLista({ ...base, link_original: link })
      expect(linha.href).toBe('')
      expect(linha.link).toBe(link.trim())
    }
  })
  it('sem link: href vazio', () => {
    expect(linhaDaLista({ ...base, link_original: null }).href).toBe('')
  })
})
