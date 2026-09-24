import { describe, it, expect } from 'vitest'
import { mensagemDeErro } from '../../src/lib/erros.js'

describe('mensagemDeErro', () => {
  it('traduz violacao de unicidade do Postgres (23505) para pt-BR', () => {
    expect(mensagemDeErro({ code: '23505', message: 'duplicate key value violates unique constraint "instituicao_apelido_apelido_key"' }))
      .toBe('Já existe um cadastro com esse nome ou apelido.')
  })

  it('usa a mensagem original para codigos nao mapeados', () => {
    expect(mensagemDeErro({ code: 'XX000', message: 'erro interno generico do Postgres' }))
      .toBe('erro interno generico do Postgres')
  })

  it('usa a mensagem original quando nao ha code (ex.: erro de rede/JS)', () => {
    expect(mensagemDeErro(new Error('Failed to fetch'))).toBe('Failed to fetch')
  })

  it('nao quebra com um valor que nao e um Error', () => {
    expect(mensagemDeErro('algo deu errado')).toBe('algo deu errado')
  })

  // As proprias funcoes SQL (ex.: mesclar_instituicoes) ja levantam excecoes
  // em pt-BR, sem usar um code mapeado aqui (P0001, o padrao de `raise
  // exception` sem `using errcode`) — a mensagem tem de passar sem alteracao.
  it('mantem a mensagem de uma excecao propria em pt-BR (P0001), sem alteracao', () => {
    expect(mensagemDeErro({ code: 'P0001', message: 'não dá para mesclar: o apelido "UFJF" já pertence a "Terceira"' }))
      .toBe('não dá para mesclar: o apelido "UFJF" já pertence a "Terceira"')
  })

  // Checagem deferida da 0013 (apelido x nome de outra instituicao): chega
  // ao salvar_instituicao do FormInstituicao com P0001 e tem de passar igual.
  it('mantem a mensagem da checagem apelido x nome (0013), sem alteracao', () => {
    expect(mensagemDeErro({ code: 'P0001', message: 'o apelido "TESTE B" já é o nome de outra instituição: "TESTE B"' }))
      .toBe('o apelido "TESTE B" já é o nome de outra instituição: "TESTE B"')
  })

  it('traduz falta de permissao do Postgres (42501) para pt-BR', () => {
    expect(mensagemDeErro({ code: '42501', message: 'new row violates row-level security policy for table "instituicao"' }))
      .toBe('Sem permissão: este e-mail não está na lista da equipe.')
  })

  it('traduz a mensagem de RLS do Storage, que chega sem code, para pt-BR', () => {
    expect(mensagemDeErro({ message: 'new row violates row-level security policy' }))
      .toBe('Sem permissão: este e-mail não está na lista da equipe.')
  })

  it('traduz violacao de check (23514, ex.: nome em branco) para pt-BR', () => {
    expect(mensagemDeErro({
      code: '23514',
      message: 'new row for relation "instituicao" violates check constraint "ck_instituicao_nome"',
    })).toBe('Preencha o nome.')
  })

  it('traduz campo obrigatorio em branco (23502) para pt-BR', () => {
    expect(mensagemDeErro({
      code: '23502',
      message: 'null value in column "nome_canonico" of relation "instituicao" violates not-null constraint',
    })).toBe('Campo obrigatório em branco.')
  })

  it('traduz erro de decodificacao de imagem do createImageBitmap (InvalidStateError) para pt-BR', () => {
    expect(mensagemDeErro({ name: 'InvalidStateError', message: 'The source image cannot be decoded.' }))
      .toBe('Não foi possível ler a imagem; use PNG, JPG ou WebP.')
  })

  it('traduz erro de decodificacao de imagem do createImageBitmap (EncodingError) para pt-BR', () => {
    expect(mensagemDeErro({ name: 'EncodingError', message: 'The source image could not be decoded.' }))
      .toBe('Não foi possível ler a imagem; use PNG, JPG ou WebP.')
  })

  // Rede de seguranca de remover_instituicao/remover_cadastro_simples
  // (0014): se uma corrida escapar da trava (SELECT ... FOR UPDATE) e o
  // delete for rejeitado pela FK restrict, o codigo chega como 23503.
  it('traduz violacao de chave estrangeira (23503, ex.: remover cadastro em uso) para pt-BR', () => {
    expect(mensagemDeErro({
      code: '23503',
      message: 'update or delete on table "prova" violates foreign key constraint "participacao_prova_id_fkey" on table "participacao"',
    })).toBe('Não foi possível remover: o cadastro está em uso.')
  })
})
