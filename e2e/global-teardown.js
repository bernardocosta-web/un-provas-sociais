// Depois de tudo: apaga dados, arquivos e usuários e afirma que nada com o
// marcador sobrou (banco e buckets). Falhar aqui reprova a execução.
import { limparTudo, contarSobras } from './ajuda/limpeza.js'

export default async function globalTeardown() {
  await limparTudo()
  const sobras = await contarSobras()
  const naoZerados = Object.entries(sobras).filter(([, n]) => n !== 0)
  if (naoZerados.length) {
    throw new Error(`Limpeza dos e2e deixou sobras: ${JSON.stringify(sobras)}`)
  }
  console.log(`Limpeza dos e2e conferida: ${JSON.stringify(sobras)}`)
}
