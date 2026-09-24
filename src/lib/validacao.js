// Espelha as constraints do banco (0006_nucleo.sql, 0007_participacao.sql)
// para a pessoa ver todas as causas de uma vez na ficha do depoimento, em
// vez de um erro cru de constraint depois de salvar. O banco continua a
// fonte da verdade — esta validação é conveniência, nunca substituição.
// Lógica pura: sem Vue, sem supabase-js.

// Aviso visual, nunca bloqueio: limite rigido produziria resumo truncado
// no meio da frase, que e pior que resumo longo.
export const LIMITE_AVISO_RESUMO = 200

// Valores vindos de formulário chegam como string ('18', ' 20 ', '').
// Number('') é 0, não ausência — por isso o trim e a checagem de vazio
// antes de converter, senão '9' > '20' (comparação lexica) engana a
// validação de "passar do máximo" e afins.
function numero(valor) {
  if (valor === null || valor === undefined) return null
  const texto = String(valor).trim()
  if (texto === '') return null
  const n = Number(texto)
  return Number.isNaN(n) ? null : n
}

export function validarDepoimento(ficha) {
  const erros = []

  if (!ficha.texto_completo?.trim()) {
    erros.push('O texto completo é obrigatório.')
  }
  if (!ficha.fonte) {
    erros.push('A fonte é obrigatória.')
  }
  if (ficha.autorizacao_publicacao === 'NAO_AUTORIZADO'
      && !(ficha.status_uso === 'DESCARTADO'
           && ficha.motivo_descarte === 'SEM_AUTORIZACAO')) {
    erros.push(
      'Depoimento sem autorização só pode ficar descartado por falta de autorização.')
  }
  if (ficha.status_uso === 'DESCARTADO' && !ficha.motivo_descarte) {
    erros.push('Depoimento descartado precisa de motivo.')
  }
  // ck_descarte_motivo, sentido inverso: motivo orfao num depoimento ativo.
  if (ficha.status_uso !== 'DESCARTADO' && ficha.motivo_descarte) {
    erros.push('Motivo de descarte só vale para depoimento descartado.')
  }
  // ck_descarte_observacao: observação só existe junto de um descarte.
  // Contrato: texto em branco ('' ou só espaços) = ausente. Uma textarea
  // limpa ou nunca preenchida manda '', não null/undefined — não é erro do
  // usuário, então esta checagem usa trim() e nunca acusa branco. Quem
  // converte branco para NULL de verdade é a camada de salvamento:
  // salvar_depoimento (Task 19) grava nullif(btrim(observacao_descarte), '').
  if (ficha.status_uso !== 'DESCARTADO' && ficha.observacao_descarte?.trim()) {
    erros.push('Observação de descarte só vale para depoimento descartado.')
  }
  if (ficha.motivo_descarte === 'OUTRO' && !ficha.observacao_descarte?.trim()) {
    erros.push('Motivo "outro" precisa de observação.')
  }
  if (ficha.status_uso === 'POSTADO' && !ficha.data_postagem) {
    erros.push('Depoimento postado precisa da data da postagem.')
  }

  for (const participacao of ficha.participacoes ?? []) {
    if (!numero(participacao.prova_id)) erros.push('Toda participação precisa de prova.')

    const ano = numero(participacao.ano)
    if (ano == null) {
      erros.push('Toda participação precisa de ano.')
    } else if (ano < 1990 || ano > 2100) {
      erros.push('O ano da participação precisa estar entre 1990 e 2100.')
    }

    for (const nota of participacao.notas ?? []) {
      if (!numero(nota.materia_id)) erros.push('Toda nota precisa de matéria.')
      if (!nota.escala) erros.push('Toda nota precisa de escala.')

      const valor = numero(nota.valor_original)
      if (valor == null) {
        erros.push('Toda nota precisa de um valor.')
      } else if (valor < 0) {
        erros.push('O valor da nota não pode ser negativo.')
      }
      if (nota.escala === 'PERCENTUAL' && valor != null && valor > 100) {
        erros.push('Nota em percentual não pode passar de 100.')
      }
      if (nota.escala === 'PONTOS') {
        const maximo = numero(nota.valor_maximo)
        if (!(maximo > 0)) {
          erros.push('Nota em pontos precisa do valor máximo.')
        } else if (valor != null && valor > maximo) {
          erros.push('Nota em pontos não pode passar do valor máximo.')
        }
      }
      if (nota.escala === 'TRI' && valor != null && (valor < 0 || valor > 1000)) {
        erros.push('Nota do TRI precisa estar entre 0 e 1000.')
      }
    }
    for (const resultado of participacao.resultados ?? []) {
      if (!resultado.situacao) erros.push('Todo resultado precisa de situação.')
      if (resultado.situacao === 'APROVADO' && !numero(resultado.instituicao_id)) {
        erros.push('Resultado aprovado precisa de instituição.')
      }
    }
  }

  return [...new Set(erros)]
}
