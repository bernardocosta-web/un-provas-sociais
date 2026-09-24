import { describe, it, expect } from 'vitest'
import { mensagemDeErro } from '../../src/lib/erros.js'

describe('mensagemDeErro', () => {
  it('traduz violacao de unicidade do Postgres (23505) para pt-BR', () => {
    expect(mensagemDeErro({ code: '23505', message: 'duplicate key value violates unique constraint "instituicao_apelido_apelido_key"' }))
      .toBe('Já existe um cadastro com esse nome ou apelido.')
  })

  it('usa a mensagem original para outros erros', () => {
    expect(mensagemDeErro({ code: '23514', message: 'nao da para mesclar uma instituicao com ela mesma' }))
      .toBe('nao da para mesclar uma instituicao com ela mesma')
  })

  it('usa a mensagem original quando nao ha code (ex.: erro de rede/JS)', () => {
    expect(mensagemDeErro(new Error('Failed to fetch'))).toBe('Failed to fetch')
  })

  it('nao quebra com um valor que nao e um Error', () => {
    expect(mensagemDeErro('algo deu errado')).toBe('algo deu errado')
  })
})
