// Passos da aba Instituições (Cadastros) pela tela.
import { expect } from '@playwright/test'

// Pela coluna Nome (2ª): o mesmo texto pode estar na coluna Apelidos de outra linha.
export const linha = (page, nomeCanonico) =>
  page.locator('tbody tr').filter({
    has: page.locator('td:nth-child(2)').getByText(nomeCanonico, { exact: true }),
  })

export async function abrirCadastros(page) {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Instituições' })).toBeVisible()
  await expect(page.getByText('Carregando…')).toHaveCount(0)
}

// Preenche o formulário já aberto (nova ou edição) e clica Salvar.
export async function preencherESalvar(page, { nomeCanonico, apelidos = [], logo = null }) {
  if (nomeCanonico !== undefined) await page.getByLabel('Nome canônico').fill(nomeCanonico)
  for (const apelido of apelidos) {
    await page.getByLabel('Novo apelido').fill(apelido)
    await page.getByRole('button', { name: 'Adicionar apelido' }).click()
  }
  if (logo) await page.locator('form input[type="file"]').setInputFiles(logo)
  await page.getByRole('button', { name: 'Salvar' }).click()
}

export async function criarPelaTela(page, dados) {
  await page.getByRole('button', { name: 'Nova instituição' }).click()
  await preencherESalvar(page, dados)
  await expect(page.getByLabel('Nome canônico')).toHaveCount(0)
  await expect(linha(page, dados.nomeCanonico.trim())).toHaveCount(1)
}

// A logo da linha aponta para o caminho gravado e carregou de verdade.
export async function esperarLogoCarregada(page, nomeCanonico, logoPath) {
  const imagem = linha(page, nomeCanonico).locator('img')
  await expect(imagem).toHaveAttribute('src', new RegExp(`/logos/${logoPath}$`))
  await expect.poll(() => imagem.evaluate((img) => img.complete && img.naturalWidth)).toBeGreaterThan(0)
}
