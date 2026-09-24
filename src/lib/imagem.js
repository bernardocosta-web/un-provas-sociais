// O post do Instagram tem 1080px de largura. Comprimir abaixo disso
// degradaria o texto do print, que e justamente o que o leitor precisa ler.
export const LARGURA_MAXIMA = 1280
export const QUALIDADE = 0.85
// O WebP nao codifica mais de 16383 px por lado. Print de conversa longa
// (1080 x 20000) passaria da largura sem problema, mas estouraria a altura
// e o toBlob falharia ou cairia para PNG.
export const ALTURA_MAXIMA_WEBP = 16383

export function calcularDimensao({ largura, altura }, larguraMaxima = LARGURA_MAXIMA) {
  const escala = Math.min(larguraMaxima / largura, ALTURA_MAXIMA_WEBP / altura, 1)
  if (escala === 1) return { largura, altura }
  return {
    largura: Math.min(larguraMaxima, Math.round(largura * escala)),
    altura: Math.min(ALTURA_MAXIMA_WEBP, Math.round(altura * escala)),
  }
}

// canvas.toBlob pode chamar o callback com null, e navegadores que nao sabem
// codificar WebP devolvem PNG em silencio (o arquivo seria nomeado .webp mas
// mentiria sobre o proprio tipo). Extraida para ser testada em Node com
// objetos simples, sem precisar de canvas de verdade.
export function validarBlobComprimido(blob) {
  if (blob === null) throw new Error('Não foi possível comprimir a imagem.')
  if (blob.type !== 'image/webp') {
    throw new Error('Este navegador não gera WebP (o Safari, por exemplo); use outro navegador.')
  }
  return blob
}

// Impuro: recebe File, devolve Blob WebP. Nao tem teste unitario —
// a decisao que importa esta em calcularDimensao e validarBlobComprimido,
// que tem.
export async function comprimir(arquivo) {
  const bitmap = await createImageBitmap(arquivo)
  const { largura, altura } = calcularDimensao(
    { largura: bitmap.width, altura: bitmap.height })
  const tela = document.createElement('canvas')
  tela.width = largura
  tela.height = altura
  tela.getContext('2d').drawImage(bitmap, 0, 0, largura, altura)
  // Libera a memoria do bitmap decodificado (prints grandes pesam dezenas
  // de MB) assim que ele ja foi desenhado no canvas.
  bitmap.close()
  const blob = await new Promise((resolver) =>
    tela.toBlob(resolver, 'image/webp', QUALIDADE))
  return validarBlobComprimido(blob)
}
