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

  // 23514 e traduzido pelo NOME da constraint, que o Postgres poe na
  // mensagem. salvar_depoimento (0015) e o primeiro caminho em que checks
  // que nao sao de nome chegam a tela; os textos batem com os de
  // validacao.js, para a pessoa ler a mesma coisa venha o erro de onde vier.
  describe('violacao de check (23514) pelo nome da constraint', () => {
    const erroDeCheck = (tabela, constraint) => ({
      code: '23514',
      message: `new row for relation "${tabela}" violates check constraint "${constraint}"`,
    })

    it.each([
      ['instituicao', 'ck_instituicao_nome'],
      ['instituicao_apelido', 'ck_apelido'],
      ['prova', 'ck_prova_nome'],
      ['curso', 'ck_curso_nome'],
      ['materia', 'ck_materia_nome'],
      ['aluno', 'ck_aluno_nome'],
    ])('%s / %s: Preencha o nome.', (tabela, constraint) => {
      expect(mensagemDeErro(erroDeCheck(tabela, constraint))).toBe('Preencha o nome.')
    })

    it.each([
      ['depoimento', 'ck_texto_nao_vazio', 'O texto completo é obrigatório.'],
      ['depoimento', 'ck_descarte_motivo',
        'Depoimento descartado precisa de motivo, e motivo de descarte só vale para depoimento descartado.'],
      ['depoimento', 'ck_descarte_observacao',
        'Observação de descarte só vale para depoimento descartado.'],
      ['depoimento', 'ck_motivo_outro', 'Motivo "outro" precisa de observação.'],
      ['depoimento', 'ck_postado_data', 'Depoimento postado precisa da data da postagem.'],
      ['depoimento', 'ck_autorizacao',
        'Depoimento sem autorização só pode ficar descartado por falta de autorização.'],
      ['participacao', 'ck_ano', 'O ano da participação precisa estar entre 1990 e 2100.'],
      ['nota', 'ck_pontos_exige_maximo', 'Nota em pontos precisa do valor máximo.'],
      ['nota', 'ck_nota_nao_negativa', 'O valor da nota não pode ser negativo.'],
      ['nota', 'ck_percentual_ate_100', 'Nota em percentual não pode passar de 100.'],
      ['nota', 'ck_pontos_ate_maximo', 'Nota em pontos não pode passar do valor máximo.'],
      ['nota', 'ck_tri_faixa', 'Nota do TRI precisa estar entre 0 e 1000.'],
      ['resultado', 'ck_aprovado_exige_instituicao', 'Resultado aprovado precisa de instituição.'],
    ])('%s / %s', (tabela, constraint, esperado) => {
      expect(mensagemDeErro(erroDeCheck(tabela, constraint))).toBe(esperado)
    })

    it('constraint sem traducao cai na mensagem generica', () => {
      expect(mensagemDeErro(erroDeCheck('membro_equipe', 'ck_email')))
        .toBe('Algum dado não obedece às regras do cadastro.')
    })

    // valida_transicao_status (0008) levanta check_violation sem nome de
    // constraint; a mensagem traz os dois status, que viram rotulos pt-BR.
    it('transicao de status recusada pelo trigger explica de onde para onde', () => {
      expect(mensagemDeErro({
        code: '23514', message: 'transicao de status invalida: DISPONIVEL -> FEITO',
      })).toBe('Não é possível mudar o status de "Disponível" para "Feito".')
    })

    it.each([
      ['EM_PRODUCAO', 'POSTADO', 'Em produção', 'Postado'],
      ['POSTADO', 'DISPONIVEL', 'Postado', 'Disponível'],
      ['DESCARTADO', 'FEITO', 'Descartado', 'Feito'],
    ])('transicao %s -> %s usa os rotulos', (de, para, rotuloDe, rotuloPara) => {
      expect(mensagemDeErro({
        code: '23514', message: `transicao de status invalida: ${de} -> ${para}`,
      })).toBe(`Não é possível mudar o status de "${rotuloDe}" para "${rotuloPara}".`)
    })

    it('status sem rotulo conhecido aparece como veio', () => {
      expect(mensagemDeErro({
        code: '23514', message: 'transicao de status invalida: NOVO -> FEITO',
      })).toBe('Não é possível mudar o status de "NOVO" para "Feito".')
    })

    it('23514 sem nome de constraint na mensagem cai na mensagem generica', () => {
      expect(mensagemDeErro({ code: '23514' }))
        .toBe('Algum dado não obedece às regras do cadastro.')
    })
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

describe('mensagemDeErro usa os rotulos de status de rotulos.js', () => {
  it('cada status do enum sai com o rotulo da ficha', async () => {
    const { STATUS } = await import('../../src/lib/rotulos.js')
    const [de, para] = [STATUS[1], STATUS[3]]
    const erro = { code: '23514', message: `transicao de status invalida: ${de.valor} -> ${para.valor}` }
    expect(mensagemDeErro(erro))
      .toBe(`Não é possível mudar o status de "${de.rotulo}" para "${para.rotulo}".`)
  })
})
