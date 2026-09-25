// Cadastros de apoio criados direto no banco (pg, superusuário), quando o
// teste é sobre OUTRA coisa e criar pela tela só gastaria tempo. Todos os
// nomes vêm de nome() (marcador.js), então a limpeza os leva.
import { consultar } from './banco.js'

const id = async (sql, parametros) => Number((await consultar(sql, parametros))[0].id)

export const criarInstituicao = (nome) =>
  id('insert into instituicao (nome_canonico) values ($1) returning id', [nome])

export const criarProva = (nome, instituicaoId = null) =>
  id('insert into prova (nome, instituicao_id) values ($1, $2) returning id', [nome, instituicaoId])

export const criarCurso = (nome) => id('insert into curso (nome) values ($1) returning id', [nome])

export const criarMateria = (nome) =>
  id('insert into materia (nome) values ($1) returning id', [nome])

// Depoimento mínimo que usa prova, matéria, instituição e curso (para os
// testes de "em uso"). O texto leva o marcador.
export async function criarDepoimentoUsando(texto, { prova, materia, instituicao, curso }) {
  const depoimento = await id(
    `insert into depoimento (texto_completo, fonte) values ($1, 'MANUAL') returning id`, [texto])
  const participacao = await id(
    'insert into participacao (depoimento_id, prova_id, ano) values ($1, $2, 2025) returning id',
    [depoimento, prova])
  await consultar(
    `insert into nota (participacao_id, materia_id, valor_original, escala)
     values ($1, $2, 80, 'PERCENTUAL')`, [participacao, materia])
  await consultar(
    `insert into resultado (participacao_id, instituicao_id, curso_id, situacao)
     values ($1, $2, $3, 'APROVADO')`, [participacao, instituicao, curso])
  return depoimento
}
