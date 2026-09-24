import { beforeEach, describe, expect, it, vi } from 'vitest'

// carregarDepoimento so monta a consulta e remodela a resposta; o cliente
// real faria rede. Um dublê encadeavel registra as chamadas e devolve a
// resposta combinada em maybeSingle().

let resposta
const chamadas = []
const consulta = {}
for (const metodo of ['select', 'eq', 'order']) {
  consulta[metodo] = vi.fn((...args) => {
    chamadas.push([metodo, ...args])
    return consulta
  })
}
consulta.maybeSingle = vi.fn(async () => resposta)

const supabaseFalso = { from: vi.fn(() => consulta) }

vi.mock('../../src/dados/cliente.js', () => ({ supabase: supabaseFalso }))

const { carregarDepoimento } = await import('../../src/dados/depoimentos.js')

const LINHA = {
  id: 7, texto_completo: 'Passei', resumo_curto: null, autor_bruto: null,
  autor_contato_bruto: null, fonte: 'MANUAL', link_original: null,
  data_depoimento: null, print_path: null, aluno_id: null,
  autorizacao_publicacao: 'NAO_INFORMADO', status_uso: 'DISPONIVEL',
  data_postagem: null, link_post: null, motivo_descarte: null,
  observacao_descarte: null,
  depoimento_tipo: [{ tipo: 'APROVACAO' }],
  depoimento_canal: [{ canal: 'SUPERIORES' }],
  participacao: [{
    id: 3, prova_id: 1, ano: 2025,
    nota: [{ id: 5, materia_id: 2, valor_original: 90, escala: 'PERCENTUAL',
      valor_maximo: null, percentual: 90 }],
    resultado: [{ id: 6, instituicao_id: 4, curso_id: null, situacao: 'APROVADO' }],
  }],
}

beforeEach(() => {
  chamadas.length = 0
  vi.clearAllMocks()
})

describe('carregarDepoimento', () => {
  it('ordena participacoes, notas e resultados por id (ficha estavel ao recarregar)', async () => {
    resposta = { data: LINHA, error: null }
    await carregarDepoimento(7)
    expect(supabaseFalso.from).toHaveBeenCalledWith('depoimento')
    expect(chamadas).toContainEqual(['eq', 'id', 7])
    expect(chamadas).toContainEqual(['order', 'id', { referencedTable: 'participacao' }])
    expect(chamadas).toContainEqual(['order', 'id', { referencedTable: 'participacao.nota' }])
    expect(chamadas).toContainEqual(
      ['order', 'id', { referencedTable: 'participacao.resultado' }])
  })

  it('devolve a ficha no formato de salvarDepoimento, sem as relacoes cruas', async () => {
    resposta = { data: LINHA, error: null }
    const ficha = await carregarDepoimento(7)
    expect(ficha).toEqual({
      id: 7, texto_completo: 'Passei', resumo_curto: null, autor_bruto: null,
      autor_contato_bruto: null, fonte: 'MANUAL', link_original: null,
      data_depoimento: null, print_path: null, aluno_id: null,
      autorizacao_publicacao: 'NAO_INFORMADO', status_uso: 'DISPONIVEL',
      data_postagem: null, link_post: null, motivo_descarte: null,
      observacao_descarte: null,
      tipos: ['APROVACAO'],
      canais: ['SUPERIORES'],
      participacoes: [{
        id: 3, prova_id: 1, ano: 2025,
        notas: [{ id: 5, materia_id: 2, valor_original: 90, escala: 'PERCENTUAL',
          valor_maximo: null, percentual: 90 }],
        resultados: [{ id: 6, instituicao_id: 4, curso_id: null, situacao: 'APROVADO' }],
      }],
    })
  })

  it('nao pede criado_em nem atualizado_em', async () => {
    resposta = { data: LINHA, error: null }
    await carregarDepoimento(7)
    const [, colunas] = chamadas.find(([m]) => m === 'select')
    expect(colunas).not.toMatch(/\*|criado_em|atualizado_em/)
  })

  it('id inexistente ou invisivel pela RLS vira erro em pt-BR', async () => {
    resposta = { data: null, error: null }
    await expect(carregarDepoimento(999)).rejects.toThrow('Depoimento não encontrado.')
  })

  it('outro erro da API sobe como veio', async () => {
    const erro = { code: '42501', message: 'permission denied' }
    resposta = { data: null, error: erro }
    await expect(carregarDepoimento(7)).rejects.toBe(erro)
  })
})
