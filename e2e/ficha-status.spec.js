// Marco 4 — status, descarte e autorização na ficha.
import { test, expect } from './ajuda/teste.js'
import { nome } from './ajuda/marcador.js'
import { consultar, depoimentosComTexto } from './ajuda/banco.js'
import { limparDados } from './ajuda/limpeza.js'
import { abrirFichaNova, preencherMinimo, salvarNova, salvarEdicao, errosDaFicha } from './ajuda/ficha.js'

test.afterAll(limparDados)

test.beforeEach(async ({ entrarComo }) => {
  await entrarComo('membro')
})

const statusGravado = async (texto) => (await depoimentosComTexto(texto))[0]

test('status: Disponível → Postado recusado, → Em produção salva, Descartado com Outro exige observação', async ({ page }) => {
  const texto = nome('Ficha status')
  await abrirFichaNova(page)
  await preencherMinimo(page, texto)
  await salvarNova(page)

  await page.getByLabel('Status').selectOption({ label: 'Postado' })
  await page.getByLabel('Data da postagem').fill('2026-09-01')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.locator('form ul[role="alert"]'))
    .toHaveText('Não é possível mudar o status de "Disponível" para "Postado".')
  expect((await statusGravado(texto)).status_uso).toBe('DISPONIVEL')

  await page.getByLabel('Status').selectOption({ label: 'Em produção' })
  await page.getByLabel('Data da postagem').fill('')
  await salvarEdicao(page)
  expect((await statusGravado(texto)).status_uso).toBe('EM_PRODUCAO')

  await page.getByLabel('Status').selectOption({ label: 'Descartado' })
  await page.getByLabel('Motivo do descarte').selectOption({ label: 'Outro' })
  await page.getByRole('button', { name: 'Salvar' }).click()
  expect(await errosDaFicha(page)).toEqual(['Motivo "outro" precisa de observação.'])
  expect((await statusGravado(texto)).status_uso).toBe('EM_PRODUCAO')

  await page.getByLabel('Observação').fill('Texto repetido de outra fonte')
  await salvarEdicao(page)
  const gravado = await statusGravado(texto)
  expect(gravado.status_uso).toBe('DESCARTADO')
  expect(gravado.motivo_descarte).toBe('OUTRO')
  expect(gravado.observacao_descarte).toBe('Texto repetido de outra fonte')
})

test('autorização "Não autorizado" põe Descartado e "Sem autorização" na hora, e salva', async ({ page }) => {
  const texto = nome('Ficha sem autorizacao')
  await abrirFichaNova(page)
  await preencherMinimo(page, texto)
  await page.getByLabel('Autorização').selectOption({ label: 'Não autorizado' })
  await expect(page.getByLabel('Status')).toHaveValue('DESCARTADO')
  await expect(page.getByLabel('Motivo do descarte')).toHaveValue('SEM_AUTORIZACAO')

  await salvarNova(page)
  const gravado = await statusGravado(texto)
  expect(gravado.autorizacao_publicacao).toBe('NAO_AUTORIZADO')
  expect(gravado.status_uso).toBe('DESCARTADO')
  expect(gravado.motivo_descarte).toBe('SEM_AUTORIZACAO')
})

// Decisão do dono: ficha nova pode nascer em qualquer status; as regras de
// integridade (data da postagem) valem já na criação.
test('ficha nova já Postado: sem data dá o erro da data; com data salva', async ({ page }) => {
  const texto = nome('Ficha nova postada')
  await abrirFichaNova(page)
  await preencherMinimo(page, texto)
  await page.getByLabel('Status').selectOption({ label: 'Postado' })
  await page.getByRole('button', { name: 'Salvar' }).click()
  expect(await errosDaFicha(page)).toEqual(['Depoimento postado precisa da data da postagem.'])
  expect(await depoimentosComTexto(texto)).toEqual([])

  await page.getByLabel('Data da postagem').fill('2026-09-20')
  await salvarNova(page)
  const gravado = await statusGravado(texto)
  expect(gravado.status_uso).toBe('POSTADO')
  const [{ data }] = await consultar(
    `select data_postagem::text as data from depoimento where id = $1`, [gravado.id])
  expect(data).toBe('2026-09-20')
})
