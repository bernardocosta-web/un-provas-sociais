// Task 21 — filtros da lista um a um, pela tela: abas por fonte (a aba e o
// filtro de fonte; os outros filtros sobrevivem a troca), coluna de
// autorizacao so no Forms, "Tem link original?", percentual e TRI
// separados, ano exato e faixa, "Limpar filtros". Cada teste recorta seus
// depoimentos com um texto unico (filtro Texto) para nao ver os de outros.
import { test, expect } from './ajuda/teste.js'
import { nome } from './ajuda/marcador.js'
import { criarProva, criarMateria } from './ajuda/cadastros.js'
import { limparDados } from './ajuda/limpeza.js'
import {
  criarDepoimento, contagem, linhas, abrirLista, filtrarTexto, preencherCampo,
  adicionarPercentual, adicionarTri,
} from './ajuda/lista.js'

test.afterAll(limparDados)

// A lista carrega as opcoes (materias etc.) ao abrir: cada teste cria os
// dados antes e so entao abre a lista.
test.beforeEach(async ({ entrarComo }) => {
  await entrarComo('membro')
})

const cabecalhos = (page) => page.locator('thead th')

test('abas: filtram pela fonte e mantem os outros filtros; autorizacao so no Forms', async ({ page }) => {
  const recorte = nome('Abas')
  await criarDepoimento({ texto: `${recorte} google`, fonte: 'GOOGLE_REVIEW', link: 'https://exemplo.test/g' })
  await criarDepoimento({
    texto: `${recorte} forms`, fonte: 'GOOGLE_FORMS', autor: 'Fulana Forms',
    contato: '@fulana', autorizacao: 'AUTORIZADO',
  })
  await criarDepoimento({ texto: `${recorte} manual`, fonte: 'MANUAL' })

  await abrirLista(page)
  await filtrarTexto(page, recorte)
  await expect(contagem(page)).toHaveText('3 depoimentos')
  await expect(cabecalhos(page).filter({ hasText: 'Autorização' })).toHaveCount(0)

  await page.getByRole('tab', { name: 'Forms' }).click()
  await expect(contagem(page)).toHaveText('1 depoimento')
  await expect(linhas(page)).toContainText(`${recorte} forms`)
  await expect(page).toHaveURL(/aba=GOOGLE_FORMS/)
  await expect(page.getByLabel('Texto', { exact: true })).toHaveValue(recorte)
  const autorizacao = cabecalhos(page).filter({ hasText: 'Autorização' })
  await expect(autorizacao).toHaveCount(1)
  await expect(autorizacao).toHaveClass(/destaque/)
  const celula = linhas(page).locator('td[data-coluna="autorizacao"]')
  await expect(celula).toHaveClass(/destaque/)
  await expect(celula.locator('strong')).toHaveText('Autorizado')
  await expect(linhas(page).locator('td[data-coluna="contato"]')).toHaveText('@fulana')

  await page.getByRole('tab', { name: 'Google' }).click()
  await expect(contagem(page)).toHaveText('1 depoimento')
  await expect(linhas(page)).toContainText(`${recorte} google`)
  await expect(linhas(page).locator('td[data-coluna="link"] a')).toHaveAttribute('href', 'https://exemplo.test/g')
  await expect(cabecalhos(page).filter({ hasText: 'Autorização' })).toHaveCount(0)

  await page.getByRole('tab', { name: 'Manual' }).click()
  await expect(contagem(page)).toHaveText('1 depoimento')
  await expect(linhas(page)).toContainText(`${recorte} manual`)
  await expect(cabecalhos(page).filter({ hasText: 'Autorização' })).toHaveCount(0)

  await page.getByRole('tab', { name: 'Todos' }).click()
  await expect(contagem(page)).toHaveText('3 depoimentos')
  await expect(page).not.toHaveURL(/aba=/)
})

test('"Tem link original?" sim / nao / tanto faz (link so de espacos conta como sem link)', async ({ page }) => {
  const recorte = nome('Link')
  await criarDepoimento({ texto: `${recorte} com link`, link: 'https://exemplo.test/l' })
  await criarDepoimento({ texto: `${recorte} sem link` })
  await criarDepoimento({ texto: `${recorte} link em branco`, link: '   ' })
  await abrirLista(page)
  await filtrarTexto(page, recorte)
  await expect(contagem(page)).toHaveText('3 depoimentos')

  const campo = page.getByLabel('Tem link original?')
  await campo.selectOption({ label: 'Sim' })
  await expect(contagem(page)).toHaveText('1 depoimento')
  await expect(linhas(page)).toContainText(`${recorte} com link`)
  await expect(page).toHaveURL(/link=true/)

  await campo.selectOption({ label: 'Não' })
  await expect(contagem(page)).toHaveText('2 depoimentos')
  await expect(page.getByText(`${recorte} com link`)).toHaveCount(0)
  await expect(page).toHaveURL(/link=false/)

  await campo.selectOption({ label: 'Tanto faz' })
  await expect(contagem(page)).toHaveText('3 depoimentos')
  await expect(page).not.toHaveURL(/link=/)
})

test('percentual e TRI sao condicoes separadas', async ({ page }) => {
  const recorte = nome('Familias')
  const matematica = nome('Matematica')
  const materia = await criarMateria(matematica)
  const prova = await criarProva(nome('Prova familias'))
  await criarDepoimento({
    texto: `${recorte} tri 800`,
    participacoes: [{ prova, notas: [{ materia, valor: 800, escala: 'TRI' }] }],
  })
  await criarDepoimento({
    texto: `${recorte} percentual 90`,
    participacoes: [{ prova, notas: [{ materia, valor: 90 }] }],
  })
  await abrirLista(page)
  await filtrarTexto(page, recorte)
  await expect(contagem(page)).toHaveText('2 depoimentos')

  // TRI 800 nunca vira percentual; 90% nunca conta como TRI.
  await adicionarTri(page, matematica, 700)
  await expect(contagem(page)).toHaveText('1 depoimento')
  await expect(linhas(page)).toContainText(`${recorte} tri 800`)
  await expect(page.getByText(`${matematica} (TRI) ≥ 700`)).toBeVisible()

  await page.getByRole('button', { name: `Remover condição ${matematica} (TRI) ≥ 700` }).click()
  await expect(contagem(page)).toHaveText('2 depoimentos')
  await adicionarPercentual(page, matematica, '≥ 70%')
  await expect(contagem(page)).toHaveText('1 depoimento')
  await expect(linhas(page)).toContainText(`${recorte} percentual 90`)

  // As duas somadas: nenhum depoimento tem as duas.
  await adicionarTri(page, matematica, 700)
  await expect(contagem(page)).toHaveText('0 depoimentos')
})

test('ano exato e faixa de anos', async ({ page }) => {
  const recorte = nome('Anos')
  const prova = await criarProva(nome('Prova anos'))
  await criarDepoimento({ texto: `${recorte} 2023`, participacoes: [{ prova, ano: 2023 }] })
  await criarDepoimento({ texto: `${recorte} 2025`, participacoes: [{ prova, ano: 2025 }] })
  await abrirLista(page)
  await filtrarTexto(page, recorte)
  await expect(contagem(page)).toHaveText('2 depoimentos')

  await preencherCampo(page, 'Ano exato', '2023')
  await expect(contagem(page)).toHaveText('1 depoimento')
  await expect(linhas(page)).toContainText(`${recorte} 2023`)
  await expect(page).toHaveURL(/ano=2023/)

  await preencherCampo(page, 'Ano exato', '')
  await expect(contagem(page)).toHaveText('2 depoimentos')
  await preencherCampo(page, 'De', '2024')
  await preencherCampo(page, 'Até', '2026')
  await expect(contagem(page)).toHaveText('1 depoimento')
  await expect(linhas(page)).toContainText(`${recorte} 2025`)
  await expect(page).toHaveURL(/ano_de=2024&ano_ate=2026/)
})

test('"Limpar filtros" zera o painel e mantem a aba', async ({ page }) => {
  const recorte = nome('Limpar')
  await criarDepoimento({ texto: `${recorte} a`, tipos: ['ELOGIO'] })
  await abrirLista(page)
  await page.getByRole('tab', { name: 'Manual' }).click()
  await filtrarTexto(page, recorte)
  await page.getByRole('checkbox', { name: 'Elogio' }).check()
  await page.getByLabel('Tem print?').selectOption({ label: 'Não' })
  await expect(contagem(page)).toHaveText('1 depoimento')
  await expect(page).toHaveURL(/q=.*tipos=ELOGIO/)

  await page.getByRole('button', { name: 'Limpar filtros' }).click()
  await expect(page).toHaveURL(/#\/depoimentos\?aba=MANUAL$/)
  await expect(page.getByLabel('Texto', { exact: true })).toHaveValue('')
  await expect(page.getByRole('checkbox', { name: 'Elogio' })).not.toBeChecked()
  await expect(page.getByLabel('Tem print?')).toHaveValue('')
  await expect(page.getByRole('tab', { name: 'Manual' })).toHaveAttribute('aria-selected', 'true')
  await expect(contagem(page)).not.toHaveText('Buscando…')
})

test('link_original que nao e http(s) aparece como texto, nunca como link', async ({ page }) => {
  const recorte = nome('Link perigoso')
  await criarDepoimento({ texto: `${recorte} js`, fonte: 'GOOGLE_REVIEW', link: 'javascript:alert(1)' })
  await abrirLista(page, '#/depoimentos?aba=GOOGLE_REVIEW')
  await filtrarTexto(page, recorte)
  await expect(contagem(page)).toHaveText('1 depoimento')
  const celula = linhas(page).locator('td[data-coluna="link"]')
  await expect(celula).toHaveText('javascript:alert(1)')
  await expect(celula.locator('a')).toHaveCount(0)
})

test('voltar/avancar no historico mantem o campo Texto igual ao filtro aplicado', async ({ page }) => {
  const primeiro = nome('Historico um')
  const segundo = nome('Historico dois')
  await criarDepoimento({ texto: primeiro })
  await criarDepoimento({ texto: segundo })
  await abrirLista(page)
  const campo = page.getByLabel('Texto', { exact: true })
  await filtrarTexto(page, primeiro)
  await expect(contagem(page)).toHaveText('1 depoimento')
  await filtrarTexto(page, segundo)
  await expect(linhas(page)).toContainText(segundo)

  await page.goBack()
  await expect(linhas(page)).toContainText(primeiro)
  await expect(campo).toHaveValue(primeiro)
  await page.goForward()
  await expect(linhas(page)).toContainText(segundo)
  await expect(campo).toHaveValue(segundo)

  // Texto so de espacos e descartado pela normalizacao: o campo volta ao aplicado.
  await filtrarTexto(page, '   ')
  await expect(page).toHaveURL(/#\/depoimentos$/)
  await expect(campo).toHaveValue('')
})
