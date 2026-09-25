// PNG pequeno gerado na hora (o repositório ignora *.png): cor sólida RGB,
// sem dependência. Cores diferentes dão arquivos diferentes.
import { deflateSync } from 'node:zlib'

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes) {
  let c = 0xffffffff
  for (const b of bytes) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function bloco(tipo, dados) {
  const tamanho = Buffer.alloc(4)
  tamanho.writeUInt32BE(dados.length)
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(corpo))
  return Buffer.concat([tamanho, corpo, crc])
}

export function gerarPng([r, g, b], largura = 40, altura = 30) {
  const cabecalho = Buffer.alloc(13)
  cabecalho.writeUInt32BE(largura, 0)
  cabecalho.writeUInt32BE(altura, 4)
  cabecalho.set([8, 2, 0, 0, 0], 8) // 8 bits, RGB, sem entrelaçamento
  const linha = Buffer.concat([Buffer.from([0]), Buffer.from(Array(largura).fill([r, g, b]).flat())])
  const pixels = Buffer.concat(Array(altura).fill(linha))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', cabecalho),
    bloco('IDAT', deflateSync(pixels)),
    bloco('IEND', Buffer.alloc(0)),
  ])
}

export const arquivoPng = (cor, nomeArquivo = 'imagem.png') =>
  ({ name: nomeArquivo, mimeType: 'image/png', buffer: gerarPng(cor) })

// Cola a imagem como um Ctrl+V: evento `paste` na janela com um
// DataTransfer contendo o arquivo (CampoPrint escuta paste no window).
export async function colarImagem(page, cor) {
  await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const dados = new DataTransfer()
    dados.items.add(new File([bytes], 'print.png', { type: 'image/png' }))
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dados, bubbles: true }))
  }, gerarPng(cor).toString('base64'))
}
