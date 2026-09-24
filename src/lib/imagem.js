// O post do Instagram tem 1080px de largura. Comprimir abaixo disso
// degradaria o texto do print, que e justamente o que o leitor precisa ler.
export const LARGURA_MAXIMA = 1280
export const QUALIDADE = 0.85

export function calcularDimensao({ largura, altura }, larguraMaxima = LARGURA_MAXIMA) {
  if (largura <= larguraMaxima) return { largura, altura }
  const escala = larguraMaxima / largura
  return { largura: larguraMaxima, altura: Math.round(altura * escala) }
}

// canvas.toBlob pode chamar o callback com null, e navegadores que nao sabem
// codificar WebP devolvem PNG em silencio (o arquivo seria nomeado .webp mas
// mentiria sobre o proprio tipo). Extraida para ser testada em Node com
// objetos simples, sem precisar de canvas de verdade.
export function validarBlobComprimido(blob) {
  if (blob === null) throw new Error('Não foi possível comprimir a imagem.')
  if (blob.type !== 'image/webp') {
    throw new Error('Este navegador não gera WebP; use o Chrome ou o Edge.')
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
  const blob = await new Promise((resolver) =>
    tela.toBlob(resolver, 'image/webp', QUALIDADE))
  return validarBlobComprimido(blob)
}
