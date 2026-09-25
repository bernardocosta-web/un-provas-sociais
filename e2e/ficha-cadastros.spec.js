// Marco 4 — aluno na ficha, cadastros criados pela caixa da ficha e
// cadastro em uso que não se remove.
import { randomBytes } from 'node:crypto'
import { test, expect } from './ajuda/teste.js'
import { nome } from './ajuda/marcador.js'
import { consultar, depoimentosComTexto } from './ajuda/banco.js'
import { criarInstituicao, criarProva, criarCurso, criarMateria } from './ajuda/cadastros.js'
import { limparDados } from './ajuda/limpeza.js'
import { abrirCadastros, linha } from './ajuda/instituicoes.js'
import {
  abrirFichaNova, preencherMinimo, escolher, criarPelaCaixa, participacao, salvarNova, salvarEdicao,
} from './ajuda/ficha.js'

test.afterAll(limparDados)

test.beforeEach(async ({ entrarComo }) => {
  await entrarComo('membro')
})

const alunoGravado = async (texto) => (await depoimentosComTexto(texto))[0].aluno_id

test('aluno: criar e ligar; em outra ficha a sugestão aparece, não liga sozinha, liga no clique e desliga', async ({ page }) => {
  const aluna = nome('Aluna')
  const perfil = `e2e${randomBytes(4).toString('hex')}`

  const texto1 = nome('Ficha aluna 1')
  await abrirFichaNova(page)
  await preencherMinimo(page, texto1)
  await page.getByLabel('Autor (como veio da fonte)').fill(aluna)
  await page.getByRole('button', { name: 'Novo aluno' }).click()
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue(aluna)
  await page.getByLabel('Perfil').selectOption({ label: 'Instagram' })
  await page.getByLabel('Identificador').fill(perfil)
  await page.getByRole('button', { name: 'Criar e ligar' }).click()
  await expect(page.getByText(`Aluno: ${aluna}`)).toBeVisible()
  await salvarNova(page)
  const [{ id: idAluna }] = await consultar('select id from aluno where nome_exibicao = $1', [aluna])
  expect(await alunoGravado(texto1)).toBe(idAluna)

  const texto2 = nome('Ficha aluna 2')
  await abrirFichaNova(page)
  await preencherMinimo(page, texto2)
  await page.getByLabel('Autor (como veio da fonte)').fill(`@${perfil}`)
  const sugestao = page.getByText(`Parece ser ${aluna} — ligar?`)
  await expect(sugestao).toBeVisible()
  await salvarNova(page)
  expect(await alunoGravado(texto2)).toBeNull()

  await expect(sugestao).toBeVisible()
  await sugestao.getByRole('button', { name: 'Ligar' }).click()
  await expect(page.getByText(`Aluno: ${aluna}`)).toBeVisible()
  await salvarEdicao(page)
  expect(await alunoGravado(texto2)).toBe(idAluna)

  await page.getByRole('button', { name: 'Desligar' }).click()
  await expect(sugestao).toBeVisible()
  await salvarEdicao(page)
  expect(await alunoGravado(texto2)).toBeNull()
})

test('prova, curso e instituição criados pela caixa da ficha aparecem em Cadastros', async ({ page }) => {
  const prova = nome('Prova na caixa')
  const instituicao = nome('Inst na caixa')
  const curso = nome('Curso na caixa')
  await abrirFichaNova(page)
  await page.getByRole('button', { name: '+ Participação' }).click()
  const p = participacao(page, 0)
  await criarPelaCaixa(p, 'Prova', prova)
  await p.getByRole('button', { name: '+ Resultado' }).click()
  await criarPelaCaixa(p, 'Instituição', instituicao)
  await criarPelaCaixa(p, 'Curso', curso)
  await expect(page.getByRole('alert')).toHaveCount(0)

  await abrirCadastros(page)
  await expect(linha(page, instituicao)).toHaveCount(1)
  for (const [aba, texto] of [['Provas', prova], ['Cursos', curso]]) {
    await page.getByRole('button', { name: aba, exact: true }).click()
    await expect(page.getByText('Carregando…')).toHaveCount(0)
    await expect(page.locator('section section li').filter({ hasText: texto })).toHaveCount(1)
  }
})

test('cadastro usado numa ficha não se remove em Cadastros', async ({ page }) => {
  const instituicao = nome('Inst usada na ficha')
  const prova = nome('Prova usada na ficha')
  const materia = nome('Materia usada na ficha')
  const curso = nome('Curso usado na ficha')
  await criarInstituicao(instituicao)
  await criarProva(prova)
  await criarMateria(materia)
  await criarCurso(curso)

  await abrirFichaNova(page)
  await preencherMinimo(page, nome('Ficha usa cadastros'))
  await page.getByRole('button', { name: '+ Participação' }).click()
  const p = participacao(page, 0)
  await escolher(p, 'Prova', prova)
  await p.getByLabel('Ano').fill('2025')
  await p.getByRole('button', { name: '+ Nota' }).click()
  await p.getByLabel('Matéria').selectOption({ label: materia })
  await p.getByLabel('Valor').fill('90')
  await p.getByRole('button', { name: '+ Resultado' }).click()
  await escolher(p, 'Instituição', instituicao)
  await escolher(p, 'Curso', curso)
  await p.getByLabel('Situação').selectOption({ label: 'Aprovado' })
  await salvarNova(page)

  await abrirCadastros(page)
  await linha(page, instituicao).getByRole('button', { name: 'Remover' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    `"${instituicao}" está em uso em 1 resultado(s). Para juntar com outra instituição, use Mesclar.`)
  await expect(linha(page, instituicao)).toHaveCount(1)

  for (const [aba, texto, mensagem] of [
    ['Provas', prova, `A prova "${prova}" está em uso em 1 participação(ões).`],
    ['Cursos', curso, `O curso "${curso}" está em uso em 1 resultado(s).`],
    ['Matérias', materia, `A matéria "${materia}" está em uso em 1 nota(s).`],
  ]) {
    await page.getByRole('button', { name: aba, exact: true }).click()
    await expect(page.getByText('Carregando…')).toHaveCount(0)
    const item = page.locator('section section li').filter({ hasText: texto })
    await item.getByRole('button', { name: 'Remover' }).click()
    await expect(page.getByRole('alert')).toHaveText(mensagem)
    await expect(item).toHaveCount(1)
  }
})
