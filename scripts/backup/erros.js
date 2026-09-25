// Erro com mensagem ja pronta para o log do Actions e para o /fail do
// Healthchecks: em pt-BR, dizendo o que conferir, e NUNCA com valor de
// Secret dentro. `etapa` diz em que ponto do backup parou.
export class ErroBackup extends Error {
  constructor(mensagem, { etapa, causa } = {}) {
    super(mensagem)
    this.name = 'ErroBackup'
    this.etapa = etapa
    if (causa) this.cause = causa
  }
}
