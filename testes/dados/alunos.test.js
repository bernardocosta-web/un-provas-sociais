import { beforeEach, describe, expect, it, vi } from 'vitest'

// Dublê encadeavel do supabase-js: cada from(tabela) registra a cadeia de
// chamadas e, ao ser aguardado (then) ou em single(), devolve a proxima
// resposta combinada para aquela tabela e operacao.
const chamadas = []
let respostas = {}

function construtor(tabela) {
  let operacao = 'select'
  const cadeia = {}
  for (const metodo of ['select', 'insert', 'delete', 'eq', 'order']) {
    cadeia[metodo] = (...args) => {
      if (metodo === 'insert' || metodo === 'delete') operacao = metodo
      chamadas.push([tabela, metodo, ...args])
      return cadeia
    }
  }
  const responder = () => Promise.resolve(respostas[`${tabela}.${operacao}`] ?? { data: null, error: null })
  cadeia.single = responder
  cadeia.then = (ok, falha) => responder().then(ok, falha)
  return cadeia
}

vi.mock('../../src/dados/cliente.js', () => ({ supabase: { from: (t) => construtor(t) } }))

const { listarAlunos, criarAluno } = await import('../../src/dados/alunos.js')

beforeEach(() => {
  chamadas.length = 0
  respostas = {}
})

describe('listarAlunos', () => {
  it('troca aluno_perfil por perfis', async () => {
    respostas['aluno.select'] = {
      data: [{ id: 1, nome_exibicao: 'Ana', aluno_perfil: [{ identificador: '@ana' }] },
        { id: 2, nome_exibicao: 'Bia', aluno_perfil: null }],
      error: null,
    }
    expect(await listarAlunos()).toEqual([
      { id: 1, nome_exibicao: 'Ana', perfis: [{ identificador: '@ana' }] },
      { id: 2, nome_exibicao: 'Bia', perfis: [] },
    ])
  })
})

describe('criarAluno', () => {
  it('grava o aluno aparado e so os perfis com identificador', async () => {
    respostas['aluno.insert'] = { data: { id: 5, nome_exibicao: 'Ana' }, error: null }
    respostas['aluno_perfil.insert'] = {
      data: [{ plataforma: 'INSTAGRAM', identificador: '@ana', url: null }], error: null,
    }
    const aluno = await criarAluno('  Ana ', [
      { plataforma: 'INSTAGRAM', identificador: ' @ana ' },
      { plataforma: 'GOOGLE', identificador: '  ' },
    ])
    expect(chamadas).toContainEqual(['aluno', 'insert', { nome_exibicao: 'Ana' }])
    expect(chamadas).toContainEqual(['aluno_perfil', 'insert', [
      { aluno_id: 5, plataforma: 'INSTAGRAM', identificador: '@ana', url: null }]])
    expect(aluno).toEqual({ id: 5, nome_exibicao: 'Ana',
      perfis: [{ plataforma: 'INSTAGRAM', identificador: '@ana', url: null }] })
  })

  it('sem perfis, nao chama aluno_perfil', async () => {
    respostas['aluno.insert'] = { data: { id: 6, nome_exibicao: 'Bia' }, error: null }
    expect(await criarAluno('Bia')).toEqual({ id: 6, nome_exibicao: 'Bia', perfis: [] })
    expect(chamadas.some(([t]) => t === 'aluno_perfil')).toBe(false)
  })

  it('perfil recusado apaga o aluno recem-criado e repassa o erro', async () => {
    const erro = { code: '42501', message: 'negado' }
    respostas['aluno.insert'] = { data: { id: 7, nome_exibicao: 'Caio' }, error: null }
    respostas['aluno_perfil.insert'] = { data: null, error: erro }
    await expect(criarAluno('Caio', [{ plataforma: 'OUTRO', identificador: 'caio' }]))
      .rejects.toBe(erro)
    expect(chamadas).toContainEqual(['aluno', 'delete'])
    expect(chamadas).toContainEqual(['aluno', 'eq', 'id', 7])
  })

  it('limpeza recusada avisa no console e o erro original continua', async () => {
    const erro = { code: '42501', message: 'negado' }
    respostas['aluno.insert'] = { data: { id: 8, nome_exibicao: 'Duda' }, error: null }
    respostas['aluno_perfil.insert'] = { data: null, error: erro }
    respostas['aluno.delete'] = { data: null, error: { message: 'sem rede' } }
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(criarAluno('Duda', [{ plataforma: 'OUTRO', identificador: 'duda' }]))
      .rejects.toBe(erro)
    expect(aviso).toHaveBeenCalledWith('Aluno criado sem perfil ficou no banco:', 'sem rede')
    aviso.mockRestore()
  })
})
