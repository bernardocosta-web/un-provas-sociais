// Capturas de tela para o checklist manual do Marco 5 (julgamento de
// aparencia do dono): lista em cada aba, painel com condicoes e uma ficha.
// So roda com E2E_CAPTURAS=1 (`npm run test:e2e:capturas`); fora disso o
// playwright.config.js ignora este arquivo. Dados todos inventados, com o
// marcador (limpos no fim como os outros e2e). O script fixa o marcador em
// "E2E-CAPTURAS" para os textos sairem iguais de uma execucao para outra.
import { test, expect } from './ajuda/teste.js'
import { marcador } from './ajuda/marcador.js'
import { criarInstituicao, criarProva, criarMateria } from './ajuda/cadastros.js'
import { limparDados } from './ajuda/limpeza.js'
import {
  criarDepoimento, darLogo, contagem, abrirLista, escolherCadastro, adicionarPercentual, adicionarTri,
} from './ajuda/lista.js'

const PASTA = 'docs/checklists/marco-5-telas'

test.use({ viewport: { width: 1280, height: 800 } })
test.afterAll(limparDados)

async function capturar(page, arquivo) {
  // Logos carregadas antes da foto (senao a imagem sai quebrada ou vazia).
  await expect.poll(() => page.locator('img').evaluateAll(
    (imagens) => imagens.every((img) => img.complete && img.naturalWidth > 0))).toBe(true)
  await page.screenshot({ path: `${PASTA}/${arquivo}`, fullPage: true, animations: 'disabled', caret: 'hide' })
}

test('capturas da lista, do painel e da ficha', async ({ page, entrarComo }) => {
  const m = marcador()
  const fisica = await criarMateria(`${m} Física`)
  const matematica = await criarMateria(`${m} Matemática`)
  const ita = await criarInstituicao(`${m} ITA`)
  const ufmg = await criarInstituicao(`${m} UFMG`)
  await darLogo(ita, [20, 90, 200])
  await darLogo(ufmg, [200, 40, 40])
  const enem = await criarProva(`${m} ENEM`)
  const vestibular = await criarProva(`${m} Vestibular ITA`, ita)

  const alvo = await criarDepoimento({
    texto: `${m} Gabaritei física no ENEM e passei no ITA. O canal mudou meu jeito de estudar.`,
    fonte: 'MANUAL', autor: 'Aluna Exemplo', tipos: ['APROVACAO', 'TRANSFORMACAO'],
    participacoes: [
      { prova: enem, ano: 2025, notas: [{ materia: fisica, valor: 100 }, { materia: matematica, valor: 780, escala: 'TRI' }] },
      { prova: vestibular, ano: 2025, resultados: [{ instituicao: ita }] },
    ],
  })
  await criarDepoimento({
    texto: `${m} Aulas claras e objetivas, recomendo para quem vai prestar vestibular.`,
    fonte: 'GOOGLE_REVIEW', autor: 'Avaliador Exemplo', link: 'https://exemplo.test/avaliacao',
    tipos: ['ELOGIO'],
  })
  await criarDepoimento({
    texto: `${m} Passei na UFMG estudando pelas aulas do canal.`,
    fonte: 'GOOGLE_FORMS', autor: 'Aluno Formulário', contato: '@aluno.exemplo',
    autorizacao: 'AUTORIZADO', tipos: ['APROVACAO'],
    participacoes: [{ prova: enem, ano: 2024, resultados: [{ instituicao: ufmg }] }],
  })

  await entrarComo('membro')
  const consulta = `q=${encodeURIComponent(m)}`
  for (const [aba, arquivo] of [
    ['TODOS', 'lista-todos.png'], ['GOOGLE_REVIEW', 'lista-google.png'],
    ['GOOGLE_FORMS', 'lista-forms.png'], ['MANUAL', 'lista-manual.png'],
  ]) {
    const destino = aba === 'TODOS' ? `#/depoimentos?${consulta}` : `#/depoimentos?aba=${aba}&${consulta}`
    await abrirLista(page, destino)
    await expect(contagem(page)).toHaveText(aba === 'TODOS' ? '3 depoimentos' : '1 depoimento')
    await capturar(page, arquivo)
  }

  await abrirLista(page, `#/depoimentos?${consulta}`)
  await adicionarPercentual(page, `${m} Física`, '= 100%')
  await adicionarTri(page, `${m} Matemática`, 700)
  await escolherCadastro(page, 'Instituição aprovada', `${m} ITA`)
  await expect(contagem(page)).toHaveText('1 depoimento')
  await capturar(page, 'painel-com-condicoes.png')

  await page.goto(`#/ficha/${alvo}`)
  await expect(page.getByLabel('Texto completo')).toHaveValue(/Gabaritei física/)
  await expect(page.getByText('Carregando…')).toHaveCount(0)
  await capturar(page, 'ficha.png')
})
