// Marco 4 — ficha completa, recarregar, editar sem duplicar, resultado do
// meio, validação no cliente, resumo longo e id inexistente. Troca e
// descarte do print ficam em ficha-print.spec.js.
import { test, expect } from './ajuda/teste.js'
import { nome } from './ajuda/marcador.js'
import { colarImagem } from './ajuda/imagem.js'
import { consultar, arquivosNoBucket, depoimentosComTexto } from './ajuda/banco.js'
import { criarInstituicao, criarProva, criarCurso, criarMateria } from './ajuda/cadastros.js'
import { limparDados } from './ajuda/limpeza.js'
import {
  abrirFichaNova, preencherMinimo, escolher, caixa, participacao, salvarNova, salvarEdicao,
  errosDaFicha,
} from './ajuda/ficha.js'

test.afterAll(limparDados)

test.beforeEach(async ({ entrarComo }) => {
  await entrarComo('membro')
})

const imagemCarregada = (imagem) =>
  expect.poll(() => imagem.evaluate((img) => img.complete && img.naturalWidth)).toBeGreaterThan(0)

test('ficha completa: salvar leva a #/ficha/<id> e recarregar traz tudo de volta', async ({ page }) => {
  const ita = nome('ITA')
  const vestibular = nome('Vestibular do ITA')
  const fisica = nome('Física')
  const curso = nome('Engenharia')
  await criarProva(vestibular, await criarInstituicao(ita))
  await criarMateria(fisica)
  await criarCurso(curso)
  const texto = nome('Ficha completa')

  await abrirFichaNova(page)
  await preencherMinimo(page, texto)
  await page.getByLabel('Aprovação').check()
  await page.getByLabel('Elogio').check()

  await page.getByRole('button', { name: '+ Participação' }).click()
  const enem = participacao(page, 0)
  await escolher(enem, 'Prova', 'ENEM')
  await enem.getByLabel('Ano').fill('2024')
  await enem.getByRole('button', { name: '+ Nota' }).click()
  await expect(enem.getByLabel('Escala')).toHaveValue('TRI')
  await enem.getByLabel('Escala').selectOption('PONTOS')
  await expect(enem.getByLabel('Máximo')).toBeVisible()
  await enem.getByLabel('Escala').selectOption('PERCENTUAL')
  await expect(enem.getByLabel('Máximo')).toHaveCount(0)
  await enem.getByLabel('Matéria').selectOption({ label: fisica })
  await enem.getByLabel('Valor').fill('100')

  await page.getByRole('button', { name: '+ Participação' }).click()
  const vest = participacao(page, 1)
  await escolher(vest, 'Prova', vestibular)
  await vest.getByLabel('Ano').fill('2025')
  await vest.getByRole('button', { name: '+ Resultado' }).click()
  await escolher(vest, 'Instituição', ita)
  await escolher(vest, 'Curso', curso)
  await vest.getByLabel('Situação').selectOption({ label: 'Aprovado' })

  await colarImagem(page, [10, 120, 200])
  await expect(page.getByRole('img', { name: 'Prévia do print novo' })).toBeVisible()

  const id = await salvarNova(page)
  await page.reload()
  await expect(page.getByLabel('Texto completo')).toHaveValue(texto)

  await expect(page.getByRole('combobox', { name: /^Fonte/ })).toHaveValue('MANUAL')
  await expect(page.getByLabel('Aprovação')).toBeChecked()
  await expect(page.getByLabel('Elogio')).toBeChecked()
  await expect(page.getByLabel('Transformação')).not.toBeChecked()
  await expect(page.locator('article')).toHaveCount(2)
  await expect(caixa(participacao(page, 0), 'Prova')).toContainText('ENEM')
  await expect(participacao(page, 0).getByLabel('Ano')).toHaveValue('2024')
  await expect(participacao(page, 0).getByLabel('Matéria')).toHaveValue(
    String((await consultar('select id from materia where nome = $1', [fisica]))[0].id))
  await expect(participacao(page, 0).getByLabel('Valor')).toHaveValue('100')
  await expect(participacao(page, 0).getByLabel('Escala')).toHaveValue('PERCENTUAL')
  await expect(caixa(participacao(page, 1), 'Prova')).toContainText(vestibular)
  await expect(caixa(participacao(page, 1), 'Instituição')).toContainText(ita)
  await expect(caixa(participacao(page, 1), 'Curso')).toContainText(curso)
  await expect(participacao(page, 1).getByLabel('Situação')).toHaveValue('APROVADO')
  await imagemCarregada(page.getByRole('img', { name: 'Print salvo' }))

  const [gravado] = await depoimentosComTexto(texto)
  expect(Number(gravado.id)).toBe(id)
  expect(await arquivosNoBucket('prints')).toContain(gravado.print_path)
})

test('editar e salvar de novo mantém um único registro', async ({ page }) => {
  const texto = nome('Ficha editar')
  await abrirFichaNova(page)
  await preencherMinimo(page, texto)
  await salvarNova(page)

  await page.getByLabel('Resumo curto').fill('Resumo novo')
  await salvarEdicao(page)
  await page.getByLabel('Resumo curto').fill('Resumo mais novo')
  await salvarEdicao(page)

  const gravados = await depoimentosComTexto(texto)
  expect(gravados).toHaveLength(1)
  expect(gravados[0].resumo_curto).toBe('Resumo mais novo')
})

test('remover o resultado do meio de três mantém instituição e curso dos outros', async ({ page }) => {
  const instituicoes = [nome('Inst A'), nome('Inst B'), nome('Inst C')]
  const cursos = [nome('Curso A'), nome('Curso B'), nome('Curso C')]
  for (const i of instituicoes) await criarInstituicao(i)
  for (const c of cursos) await criarCurso(c)
  const texto = nome('Ficha tres resultados')

  await abrirFichaNova(page)
  await preencherMinimo(page, texto)
  await page.getByRole('button', { name: '+ Participação' }).click()
  const p = participacao(page, 0)
  await escolher(p, 'Prova', 'ENEM')
  await p.getByLabel('Ano').fill('2025')
  for (let n = 0; n < 3; n++) {
    await p.getByRole('button', { name: '+ Resultado' }).click()
    const resultado = p.locator('fieldset').filter({ hasText: 'Resultados' }).locator(':scope > div').nth(n)
    await escolher(resultado, 'Instituição', instituicoes[n])
    await escolher(resultado, 'Curso', cursos[n])
    await resultado.getByLabel('Situação').selectOption({ label: 'Aprovado' })
  }

  const resultados = () => p.locator('fieldset').filter({ hasText: 'Resultados' }).locator(':scope > div')
  await resultados().nth(1).getByRole('button', { name: 'Remover resultado' }).click()
  await expect(resultados()).toHaveCount(2)
  const conferir = async () => {
    await expect(caixa(resultados().nth(0), 'Instituição')).toContainText(instituicoes[0])
    await expect(caixa(resultados().nth(0), 'Curso')).toContainText(cursos[0])
    await expect(caixa(resultados().nth(1), 'Instituição')).toContainText(instituicoes[2])
    await expect(caixa(resultados().nth(1), 'Curso')).toContainText(cursos[2])
  }
  await conferir()

  await salvarNova(page)
  await page.reload()
  await expect(page.getByLabel('Texto completo')).toHaveValue(texto)
  await expect(resultados()).toHaveCount(2)
  await conferir()
})

test('validação no cliente mostra as mensagens e não envia o print colado', async ({ page }) => {
  const materia = nome('Materia validacao')
  await criarMateria(materia)
  const antes = await arquivosNoBucket('prints')

  await abrirFichaNova(page)
  await preencherMinimo(page, nome('Ficha invalida'))
  await page.getByRole('button', { name: '+ Participação' }).click()
  const p = participacao(page, 0)
  await escolher(p, 'Prova', 'ENEM')
  await p.getByLabel('Ano').fill('2025')
  await p.getByRole('button', { name: '+ Nota' }).click()
  await p.getByLabel('Matéria').selectOption({ label: materia })
  await p.getByLabel('Escala').selectOption('PERCENTUAL')
  await p.getByLabel('Valor').fill('101')
  await p.getByRole('button', { name: '+ Resultado' }).click()
  await p.getByLabel('Situação').selectOption({ label: 'Aprovado' })
  await colarImagem(page, [1, 2, 3])
  await expect(page.getByRole('img', { name: 'Prévia do print novo' })).toBeVisible()

  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.locator('form ul[role="alert"]')).toBeVisible()
  expect(await errosDaFicha(page)).toEqual([
    'Nota em percentual não pode passar de 100.',
    'Resultado aprovado precisa de instituição.',
  ])
  await expect(page).toHaveURL(/#\/ficha$/)
  expect(await arquivosNoBucket('prints')).toEqual(antes)
})

test('resumo acima de 200 caracteres mostra o aviso e salva assim mesmo', async ({ page }) => {
  const texto = nome('Ficha resumo longo')
  const resumo = 'r'.repeat(201)
  await abrirFichaNova(page)
  await preencherMinimo(page, texto)
  await page.getByLabel('Resumo curto').fill(resumo)
  const aviso = page.locator('small.aviso')
  await expect(aviso).toBeVisible()
  await expect(aviso).toContainText('201 caracteres')
  await expect(aviso).toContainText('Você pode salvar assim mesmo.')

  await salvarNova(page)
  expect((await depoimentosComTexto(texto))[0].resumo_curto).toBe(resumo)
})

test('#/ficha/999999 mostra só "Depoimento não encontrado.", Tentar de novo e Voltar', async ({ page }) => {
  await page.goto('#/ficha/999999')
  const alerta = page.getByRole('alert')
  await expect(alerta).toContainText('Depoimento não encontrado.')
  await expect(alerta.getByRole('button', { name: 'Tentar de novo' })).toBeVisible()
  await expect(alerta.getByRole('link', { name: 'Voltar' })).toBeVisible()
  await expect(page.locator('form')).toHaveCount(0)
  await expect(page.getByLabel('Texto completo')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Salvar' })).toHaveCount(0)
})
