import { describe, it, expect, vi } from 'vitest'
import { gravarFicha } from '../../src/lib/gravacao.js'

const VALIDA = { texto_completo: 'Passei!', fonte: 'MANUAL', print_path: null }

// Dublês das operacoes de I/O (src/dados/depoimentos.js), registrando a ordem.
function operacoes({ falhaSalvar = null, falhaEnviar = null } = {}) {
  const ordem = []
  const ops = {
    enviar: vi.fn(async (arquivo, nome) => {
      ordem.push(['enviar', nome])
      if (falhaEnviar) throw falhaEnviar
      return nome
    }),
    salvar: vi.fn(async (ficha) => {
      ordem.push(['salvar', ficha.print_path])
      if (falhaSalvar) throw falhaSalvar
      return ficha.id ?? 42
    }),
    remover: vi.fn(async (caminho) => { ordem.push(['remover', caminho]) }),
    nomeUnico: () => 'novo.webp',
  }
  return { ops, ordem }
}

describe('gravarFicha', () => {
  it('ficha invalida devolve os erros e nao sobe nada', async () => {
    const { ops, ordem } = operacoes()
    const r = await gravarFicha({ ...VALIDA, texto_completo: ' ' }, 'blob', ops)
    expect(r.erros).toEqual(['O texto completo é obrigatório.'])
    expect(ordem).toEqual([])
  })

  it('sem print novo: salva com o print que ja havia e nao remove nada', async () => {
    const { ops, ordem } = operacoes()
    const r = await gravarFicha({ ...VALIDA, id: 7, print_path: 'velho.webp' }, null, ops)
    expect(r).toEqual({ erros: [], id: 7, print_path: 'velho.webp' })
    expect(ordem).toEqual([['salvar', 'velho.webp']])
  })

  it('print em branco vira null', async () => {
    const { ops } = operacoes()
    const r = await gravarFicha({ ...VALIDA, print_path: '' }, null, ops)
    expect(r.print_path).toBe(null)
  })

  it('troca de print: envia o novo, salva com ele e so depois remove o antigo', async () => {
    const { ops, ordem } = operacoes()
    const r = await gravarFicha({ ...VALIDA, id: 7, print_path: 'velho.webp' }, 'blob', ops)
    expect(ordem).toEqual([
      ['enviar', 'novo.webp'], ['salvar', 'novo.webp'], ['remover', 'velho.webp']])
    expect(r).toEqual({ erros: [], id: 7, print_path: 'novo.webp' })
  })

  it('falha ao salvar remove o print NOVO, nunca o antigo, e repassa o erro', async () => {
    const erro = { code: '23514', message: 'x' }
    const { ops, ordem } = operacoes({ falhaSalvar: erro })
    await expect(gravarFicha({ ...VALIDA, id: 7, print_path: 'velho.webp' }, 'blob', ops))
      .rejects.toBe(erro)
    expect(ordem).toEqual([
      ['enviar', 'novo.webp'], ['salvar', 'novo.webp'], ['remover', 'novo.webp']])
  })

  it('falha ao salvar depoimento novo tambem remove o print novo', async () => {
    const erro = new Error('rede')
    const { ops, ordem } = operacoes({ falhaSalvar: erro })
    await expect(gravarFicha(VALIDA, 'blob', ops)).rejects.toBe(erro)
    expect(ordem.at(-1)).toEqual(['remover', 'novo.webp'])
  })

  it('falha ao enviar nao salva nem remove nada', async () => {
    const erro = new Error('upload')
    const { ops, ordem } = operacoes({ falhaEnviar: erro })
    await expect(gravarFicha({ ...VALIDA, print_path: 'velho.webp' }, 'blob', ops))
      .rejects.toBe(erro)
    expect(ordem).toEqual([['enviar', 'novo.webp']])
  })

  it('falha ao remover (limpeza) nao derruba a gravacao nem troca o erro', async () => {
    const { ops } = operacoes()
    ops.remover = vi.fn(async () => { throw new Error('storage fora') })
    const r = await gravarFicha({ ...VALIDA, id: 7, print_path: 'velho.webp' }, 'blob', ops)
    expect(r.print_path).toBe('novo.webp')

    const erro = new Error('salvar')
    const falha = operacoes({ falhaSalvar: erro }).ops
    falha.remover = vi.fn(async () => { throw new Error('storage fora') })
    await expect(gravarFicha(VALIDA, 'blob', falha)).rejects.toBe(erro)
  })
})
