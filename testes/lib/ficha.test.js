import { describe, it, expect } from 'vitest'
import { prepararFicha } from '../../src/lib/ficha.js'

// prepararFicha deixa a ficha do formulario pronta para salvar_depoimento
// (Task 19): branco vira NULL de verdade, numero de formulario vira Number.
// O SQL repete o nullif(btrim(...), '') como defesa em profundidade.

const BASE = {
  texto_completo: 'Passei no ITA',
  fonte: 'MANUAL',
  autorizacao_publicacao: 'NAO_INFORMADO',
  status_uso: 'DISPONIVEL',
  tipos: ['APROVACAO'],
  canais: ['SUPERIORES'],
  participacoes: [],
}

function comNota(nota) {
  return { ...BASE, participacoes: [{ prova_id: '1', ano: '2025', notas: [nota], resultados: [] }] }
}

describe('prepararFicha', () => {
  it('textos opcionais em branco viram null', () => {
    const r = prepararFicha({ ...BASE,
      resumo_curto: '', autor_bruto: '  ', autor_contato_bruto: '',
      link_original: ' ', print_path: '', link_post: '', observacao_descarte: '   ' })
    expect(r.resumo_curto).toBeNull()
    expect(r.autor_bruto).toBeNull()
    expect(r.autor_contato_bruto).toBeNull()
    expect(r.link_original).toBeNull()
    expect(r.print_path).toBeNull()
    expect(r.link_post).toBeNull()
    expect(r.observacao_descarte).toBeNull()
  })

  it('textos opcionais preenchidos sao mantidos', () => {
    const r = prepararFicha({ ...BASE, resumo_curto: 'Gabaritou fisica', autor_bruto: '@fulano' })
    expect(r.resumo_curto).toBe('Gabaritou fisica')
    expect(r.autor_bruto).toBe('@fulano')
  })

  it('texto_completo e demais campos obrigatorios passam intactos', () => {
    const r = prepararFicha(BASE)
    expect(r.texto_completo).toBe('Passei no ITA')
    expect(r.fonte).toBe('MANUAL')
    expect(r.status_uso).toBe('DISPONIVEL')
    expect(r.tipos).toEqual(['APROVACAO'])
    expect(r.canais).toEqual(['SUPERIORES'])
  })

  it('datas em branco viram null', () => {
    const r = prepararFicha({ ...BASE, data_depoimento: '', data_postagem: '  ' })
    expect(r.data_depoimento).toBeNull()
    expect(r.data_postagem).toBeNull()
  })

  it('datas preenchidas sao mantidas', () => {
    expect(prepararFicha({ ...BASE, data_depoimento: '2026-09-01' }).data_depoimento)
      .toBe('2026-09-01')
  })

  it('motivo_descarte em branco vira null', () => {
    expect(prepararFicha({ ...BASE, motivo_descarte: '' }).motivo_descarte).toBeNull()
  })

  it('id e aluno_id viram Number, ou null quando em branco ou invalidos', () => {
    expect(prepararFicha({ ...BASE, id: '12' }).id).toBe(12)
    expect(prepararFicha({ ...BASE, id: '' }).id).toBeNull()
    expect(prepararFicha({ ...BASE, aluno_id: '7' }).aluno_id).toBe(7)
    expect(prepararFicha({ ...BASE, aluno_id: '' }).aluno_id).toBeNull()
    expect(prepararFicha({ ...BASE, aluno_id: 'abc' }).aluno_id).toBeNull()
  })

  it('prova_id e ano da participacao viram Number', () => {
    const r = prepararFicha({ ...BASE,
      participacoes: [{ prova_id: '3', ano: ' 2025 ', notas: [], resultados: [] }] })
    expect(r.participacoes[0].prova_id).toBe(3)
    expect(r.participacoes[0].ano).toBe(2025)
  })

  it('prova_id e ano em branco viram null', () => {
    const r = prepararFicha({ ...BASE,
      participacoes: [{ prova_id: '', ano: '', notas: [], resultados: [] }] })
    expect(r.participacoes[0].prova_id).toBeNull()
    expect(r.participacoes[0].ano).toBeNull()
  })

  it('materia_id e valor_original da nota viram Number', () => {
    const r = prepararFicha(comNota({ materia_id: '2', valor_original: '18.5',
      escala: 'PERCENTUAL' }))
    const nota = r.participacoes[0].notas[0]
    expect(nota.materia_id).toBe(2)
    expect(nota.valor_original).toBe(18.5)
    expect(nota.escala).toBe('PERCENTUAL')
  })

  it('valor_original em branco ou invalido vira null', () => {
    expect(prepararFicha(comNota({ materia_id: 2, valor_original: '', escala: 'PERCENTUAL' }))
      .participacoes[0].notas[0].valor_original).toBeNull()
    expect(prepararFicha(comNota({ materia_id: 2, valor_original: 'x', escala: 'PERCENTUAL' }))
      .participacoes[0].notas[0].valor_original).toBeNull()
  })

  it('valor_maximo vira Number quando a escala e PONTOS', () => {
    const r = prepararFicha(comNota({ materia_id: 2, valor_original: '18',
      valor_maximo: '20', escala: 'PONTOS' }))
    expect(r.participacoes[0].notas[0].valor_maximo).toBe(20)
  })

  it('valor_maximo vira null quando a escala nao e PONTOS', () => {
    for (const escala of ['PERCENTUAL', 'TRI']) {
      const r = prepararFicha(comNota({ materia_id: 2, valor_original: '80',
        valor_maximo: '20', escala }))
      expect(r.participacoes[0].notas[0].valor_maximo).toBeNull()
    }
  })

  it('valor_maximo em branco com PONTOS vira null (a validacao acusa)', () => {
    const r = prepararFicha(comNota({ materia_id: 2, valor_original: '18',
      valor_maximo: '', escala: 'PONTOS' }))
    expect(r.participacoes[0].notas[0].valor_maximo).toBeNull()
  })

  it('instituicao_id e curso_id do resultado viram Number, ou null em branco', () => {
    const r = prepararFicha({ ...BASE, participacoes: [{ prova_id: 1, ano: 2025, notas: [],
      resultados: [
        { situacao: 'APROVADO', instituicao_id: '4', curso_id: '9' },
        { situacao: 'NAO_APROVADO', instituicao_id: '', curso_id: '' },
      ] }] })
    const [a, b] = r.participacoes[0].resultados
    expect(a.instituicao_id).toBe(4)
    expect(a.curso_id).toBe(9)
    expect(a.situacao).toBe('APROVADO')
    expect(b.instituicao_id).toBeNull()
    expect(b.curso_id).toBeNull()
  })

  it('listas ausentes viram listas vazias', () => {
    const r = prepararFicha({ texto_completo: 'x', fonte: 'MANUAL',
      participacoes: [{ prova_id: 1, ano: 2025 }] })
    expect(r.tipos).toEqual([])
    expect(r.canais).toEqual([])
    expect(r.participacoes[0].notas).toEqual([])
    expect(r.participacoes[0].resultados).toEqual([])
  })

  // Duplicado viraria 23505 ("ja existe um cadastro com esse nome") e
  // branco viraria 22P02 (valor de enum invalido) no banco.
  it('tipos e canais sem repetidos nem brancos, na ordem da primeira aparicao', () => {
    const r = prepararFicha({ ...BASE,
      tipos: ['ELOGIO', '', 'APROVACAO', 'ELOGIO', '  ', null],
      canais: ['SUPERIORES', 'SUPERIORES', undefined, ''] })
    expect(r.tipos).toEqual(['ELOGIO', 'APROVACAO'])
    expect(r.canais).toEqual(['SUPERIORES'])
  })

  it('nao altera o objeto recebido', () => {
    const original = { ...BASE, resumo_curto: '', aluno_id: '7',
      participacoes: [{ prova_id: '1', ano: '2025',
        notas: [{ materia_id: '2', valor_original: '80', valor_maximo: '20',
          escala: 'PERCENTUAL' }],
        resultados: [{ situacao: 'APROVADO', instituicao_id: '4', curso_id: '' }] }] }
    const copia = structuredClone(original)
    const r = prepararFicha(original)
    expect(original).toEqual(copia)
    expect(r).not.toBe(original)
    expect(r.participacoes).not.toBe(original.participacoes)
    expect(r.participacoes[0].notas[0]).not.toBe(original.participacoes[0].notas[0])
    expect(r.tipos).not.toBe(original.tipos)
  })
})
