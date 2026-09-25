// Marco 3 + 17c — abas Provas, Cursos e Matérias: criar, duplicado,
// remover sem uso e em uso.
import { test, expect } from './ajuda/teste.js'
import { nome } from './ajuda/marcador.js'
import { consultar } from './ajuda/banco.js'
import {
  criarInstituicao, criarProva, criarCurso, criarMateria, criarDepoimentoUsando,
} from './ajuda/cadastros.js'
import { limparDados } from './ajuda/limpeza.js'
import { abrirCadastros } from './ajuda/instituicoes.js'

test.afterAll(limparDados)

test.beforeEach(async ({ entrarComo }) => {
  await entrarComo('membro')
})

const item = (page, texto) => page.locator('section section li').filter({ hasText: texto })

async function abrirAba(page, aba) {
  await abrirCadastros(page)
  await page.getByRole('button', { name: aba, exact: true }).click()
  await expect(page.getByRole('heading', { name: aba })).toBeVisible()
  await expect(page.getByText('Carregando…')).toHaveCount(0)
}

async function adicionar(page, texto) {
  await page.getByLabel('Novo nome').fill(texto)
  await page.getByRole('button', { name: 'Adicionar' }).click()
}

test('prova com instituição e prova sem instituição', async ({ page }) => {
  const instituicao = nome('Inst da prova')
  await criarInstituicao(instituicao)
  await abrirAba(page, 'Provas')

  const comInstituicao = nome('Prova com inst')
  await page.getByLabel('Instituição').selectOption({ label: instituicao })
  await adicionar(page, comInstituicao)
  await expect(item(page, comInstituicao)).toContainText(`— ${instituicao}`)

  const semInstituicao = nome('Prova sem inst')
  await adicionar(page, semInstituicao)
  await expect(item(page, semInstituicao)).toHaveCount(1)
  await expect(item(page, semInstituicao)).not.toContainText('—')

  const gravadas = await consultar(
    `select p.nome, i.nome_canonico from prova p left join instituicao i on i.id = p.instituicao_id
      where p.nome = any($1) order by p.nome`, [[comInstituicao, semInstituicao]])
  expect(gravadas).toEqual([
    { nome: comInstituicao, nome_canonico: instituicao },
    { nome: semInstituicao, nome_canonico: null },
  ].sort((a, b) => (a.nome < b.nome ? -1 : 1)))
})

for (const [aba, tabela] of [['Cursos', 'curso'], ['Matérias', 'materia']]) {
  test(`${aba.toLowerCase()}: criar e duplicado recusado em pt-BR`, async ({ page }) => {
    await abrirAba(page, aba)
    const texto = nome(aba)
    await adicionar(page, texto)
    await expect(item(page, texto)).toHaveCount(1)

    await adicionar(page, texto)
    await expect(page.getByRole('alert')).toHaveText('Já existe um cadastro com esse nome ou apelido.')
    const linhas = await consultar(`select count(*)::int as n from ${tabela} where nome = $1`, [texto])
    expect(linhas[0].n).toBe(1)
  })
}

test('remover prova, curso e matéria sem uso', async ({ page }) => {
  const prova = nome('Prova remover')
  const curso = nome('Curso remover')
  const materia = nome('Materia remover')
  await criarProva(prova)
  await criarCurso(curso)
  await criarMateria(materia)

  for (const [aba, texto, tabela] of [
    ['Provas', prova, 'prova'], ['Cursos', curso, 'curso'], ['Matérias', materia, 'materia'],
  ]) {
    await abrirAba(page, aba)
    await item(page, texto).getByRole('button', { name: 'Remover' }).click()
    await expect(item(page, texto)).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(await consultar(`select 1 from ${tabela} where nome = $1`, [texto])).toEqual([])
  }
})

test('remover prova, curso e matéria em uso é recusado dizendo onde', async ({ page }) => {
  const prova = nome('Prova em uso')
  const curso = nome('Curso em uso')
  const materia = nome('Materia em uso')
  await criarDepoimentoUsando(nome('Depoimento usa'), {
    prova: await criarProva(prova),
    materia: await criarMateria(materia),
    instituicao: await criarInstituicao(nome('Inst usada')),
    curso: await criarCurso(curso),
  })

  for (const [aba, texto, mensagem] of [
    ['Provas', prova, `A prova "${prova}" está em uso em 1 participação(ões).`],
    ['Cursos', curso, `O curso "${curso}" está em uso em 1 resultado(s).`],
    ['Matérias', materia, `A matéria "${materia}" está em uso em 1 nota(s).`],
  ]) {
    await abrirAba(page, aba)
    await item(page, texto).getByRole('button', { name: 'Remover' }).click()
    await expect(page.getByRole('alert')).toHaveText(mensagem)
    await expect(item(page, texto)).toHaveCount(1)
  }
})
