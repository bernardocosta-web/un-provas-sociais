// Passos da ficha pela tela, reaproveitados pelas specs da ficha.
import { expect } from '@playwright/test'

export async function abrirFichaNova(page) {
  await page.goto('#/ficha')
  await expect(page.getByRole('heading', { name: 'Novo depoimento' })).toBeVisible()
}

// O mínimo que a validação exige: texto (com o marcador) e fonte.
export async function preencherMinimo(page, texto) {
  await page.getByLabel('Texto completo').fill(texto)
  await page.getByRole('combobox', { name: /^Fonte/ }).selectOption({ label: 'Manual' })
}

// Combobox (CaixaBusca): Escolher/Trocar, digitar, clicar na opção.
export function caixa(escopo, rotulo) {
  return escopo.locator('.caixa-busca').filter({ hasText: `${rotulo}:` })
}

export async function escolher(escopo, rotulo, termo, opcao = termo) {
  await caixa(escopo, rotulo).getByRole('button', { name: /^(Escolher|Trocar)$/ }).click()
  await escopo.getByPlaceholder(`Buscar ${rotulo.toLowerCase()}…`).fill(termo)
  await escopo.getByRole('button', { name: opcao, exact: true }).click()
  await expect(caixa(escopo, rotulo)).toContainText(opcao)
}

export async function criarPelaCaixa(escopo, rotulo, termo) {
  await caixa(escopo, rotulo).getByRole('button', { name: /^(Escolher|Trocar)$/ }).click()
  await escopo.getByPlaceholder(`Buscar ${rotulo.toLowerCase()}…`).fill(termo)
  await escopo.getByRole('button', { name: `Criar “${termo}”` }).click()
  await expect(caixa(escopo, rotulo)).toContainText(termo)
}

export const participacao = (page, indice) => page.locator('article').nth(indice)

// Ficha nova: salvar leva a #/ficha/<id>; devolve o id.
export async function salvarNova(page) {
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page).toHaveURL(/#\/ficha\/\d+$/)
  const id = Number(/#\/ficha\/(\d+)$/.exec(page.url())[1])
  await expect(page.getByRole('heading', { name: `Depoimento #${id}` })).toBeVisible()
  await expect(page.getByLabel('Texto completo')).toBeVisible()
  return id
}

// Ficha já salva: salvar recarrega do banco e mostra "Salvo.".
export async function salvarEdicao(page) {
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByRole('status')).toHaveText('Salvo.')
}

export async function errosDaFicha(page) {
  return page.locator('form ul[role="alert"] li').allTextContents()
}
