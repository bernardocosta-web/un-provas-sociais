import { randomUUID } from 'node:crypto'
import { ErroBackup } from './erros.js'

// Pings do dead man's switch (healthchecks.io). O alarme e a AUSENCIA do ping
// de sucesso: /start e /fail sao melhor esforco (so aceleram e explicam o
// alerta); o de sucesso precisa chegar, senao o backup termina com erro. O
// mesmo `rid` liga start e fim (o painel mostra a duracao). A URL e segredo:
// quem a tem silencia o alarme — nunca vai para mensagem nem log.

const LIMITE_CORPO = 10_000

export function criarHealthchecks({
  pingUrl, fetch = globalThis.fetch, rid = randomUUID(), tentativas = 3,
  esperar = (ms) => new Promise((ok) => setTimeout(ok, ms)),
  avisar = (mensagem) => console.warn(mensagem),
}) {
  async function pingar(sufixo, corpo = '') {
    let ultimo = ''
    for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
      try {
        const resposta = await fetch(`${pingUrl}${sufixo}?rid=${encodeURIComponent(rid)}`, {
          method: 'POST',
          body: String(corpo).slice(0, LIMITE_CORPO),
          signal: AbortSignal.timeout(10_000),
        })
        if (resposta.ok) return
        ultimo = `HTTP ${resposta.status}`
      } catch (erro) {
        // A mensagem do fetch pode conter a URL: so o nome do erro sai daqui.
        ultimo = erro?.name ?? 'erro de rede'
      }
      if (tentativa < tentativas) await esperar(1000 * tentativa)
    }
    throw new ErroBackup(`Healthchecks nao recebeu o ping${sufixo ? ` ${sufixo}` : ' de sucesso'} ` +
      `apos ${tentativas} tentativas (${ultimo}). Confira HEALTHCHECKS_PING_URL.`,
    { etapa: 'Healthchecks' })
  }

  async function melhorEsforco(sufixo, corpo) {
    try {
      await pingar(sufixo, corpo)
      return true
    } catch (erro) {
      avisar(`Aviso: ${erro.message}`)
      return false
    }
  }

  return {
    inicio: () => melhorEsforco('/start'),
    sucesso: (resumo) => pingar('', resumo),
    falha: (motivo) => melhorEsforco('/fail', motivo),
  }
}
