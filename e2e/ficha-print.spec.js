// Marco 4 — print da ficha: trocar deixa só o novo no bucket; descartar o
// pendente volta à prévia do salvo sem enviar nada.
import { test, expect } from './ajuda/teste.js'
import { nome } from './ajuda/marcador.js'
import { colarImagem } from './ajuda/imagem.js'
import { arquivosNoBucket, depoimentosComTexto } from './ajuda/banco.js'
import { limparDados } from './ajuda/limpeza.js'
import { abrirFichaNova, preencherMinimo, salvarNova, salvarEdicao } from './ajuda/ficha.js'

test.afterAll(limparDados)

test.beforeEach(async ({ entrarComo }) => {
  await entrarComo('membro')
})

const imagemCarregada = (imagem) =>
  expect.poll(() => imagem.evaluate((img) => img.complete && img.naturalWidth)).toBeGreaterThan(0)

test('trocar o print deixa só o novo arquivo no bucket', async ({ page }) => {
  const texto = nome('Ficha troca print')
  await abrirFichaNova(page)
  await preencherMinimo(page, texto)
  await colarImagem(page, [200, 0, 0])
  await expect(page.getByRole('img', { name: 'Prévia do print novo' })).toBeVisible()
  await salvarNova(page)
  const antigo = (await depoimentosComTexto(texto))[0].print_path

  await colarImagem(page, [0, 200, 0])
  await expect(page.getByRole('img', { name: 'Prévia do print novo' })).toBeVisible()
  await salvarEdicao(page)

  const novo = (await depoimentosComTexto(texto))[0].print_path
  expect(novo).not.toBe(antigo)
  const arquivos = await arquivosNoBucket('prints')
  expect(arquivos).toContain(novo)
  expect(arquivos).not.toContain(antigo)
  await imagemCarregada(page.getByRole('img', { name: 'Print salvo' }))
})

test('descartar o print pendente volta à prévia do salvo e nada sobe', async ({ page }) => {
  const texto = nome('Ficha descartar print')
  await abrirFichaNova(page)
  await preencherMinimo(page, texto)
  await colarImagem(page, [100, 100, 0])
  await expect(page.getByRole('img', { name: 'Prévia do print novo' })).toBeVisible()
  await salvarNova(page)
  const salvo = (await depoimentosComTexto(texto))[0].print_path
  const antes = await arquivosNoBucket('prints')

  await colarImagem(page, [0, 100, 100])
  await expect(page.getByRole('img', { name: 'Prévia do print novo' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Print salvo' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Descartar' }).click()
  await expect(page.getByRole('img', { name: 'Prévia do print novo' })).toHaveCount(0)
  await imagemCarregada(page.getByRole('img', { name: 'Print salvo' }))

  await salvarEdicao(page)
  expect((await depoimentosComTexto(texto))[0].print_path).toBe(salvo)
  expect(await arquivosNoBucket('prints')).toEqual(antes)
})
