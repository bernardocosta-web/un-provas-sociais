// Marco 3 — acesso: login, Sair, estranho sem permissão e a trava de
// produção (a app fala só com a stack local).
import { test, expect } from './ajuda/teste.js'
import { nome } from './ajuda/marcador.js'
import { consultar } from './ajuda/banco.js'
import { limparDados } from './ajuda/limpeza.js'
import { ambienteLocal } from './ajuda/ambiente.js'

const MENSAGEM_SEM_PERMISSAO = 'Sem permissão: este e-mail não está na lista da equipe.'

test.afterAll(limparDados)

test('a app fala com o Supabase local (testes/local.js), nunca com o hospedado', async ({ page, entrarComo }) => {
  const origemLocal = new URL(ambienteLocal().url).origin
  expect(new URL(origemLocal).hostname).toBe('127.0.0.1')
  const destinos = new Set()
  page.on('request', (r) => destinos.add(new URL(r.url()).origin))
  await entrarComo('membro')
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Instituições' })).toBeVisible()
  expect([...destinos]).toContain(origemLocal)
  expect([...destinos].filter((o) => o.endsWith('.supabase.co'))).toEqual([])
})

test('deslogado vê a tela de login', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'UN Provas Sociais' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Entrar com Google' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sair' })).toHaveCount(0)
})

test('membro logado vê Cadastros e Sair volta ao login', async ({ page, entrarComo }) => {
  const sessao = await entrarComo('membro')
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Instituições' })).toBeVisible()
  await expect(page.getByText(sessao.user.email)).toBeVisible()
  await page.getByRole('button', { name: 'Sair' }).click()
  await expect(page.getByRole('button', { name: 'Entrar com Google' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Instituições' })).toHaveCount(0)
})

test('estranho vê listas vazias e não consegue criar instituição nem curso', async ({ page, entrarComo }) => {
  await entrarComo('estranho')
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Instituições' })).toBeVisible()
  await expect(page.getByText('Carregando…')).toHaveCount(0)
  await expect(page.locator('tbody tr')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)

  const instituicao = nome('Inst estranho')
  await page.getByRole('button', { name: 'Nova instituição' }).click()
  await page.getByLabel('Nome canônico').fill(instituicao)
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByRole('alert')).toHaveText(MENSAGEM_SEM_PERMISSAO)

  await page.getByRole('button', { name: 'Cursos' }).click()
  await expect(page.getByText('Carregando…')).toHaveCount(0)
  await expect(page.locator('section section li')).toHaveCount(0)
  const curso = nome('Curso estranho')
  await page.getByLabel('Novo nome').fill(curso)
  await page.getByRole('button', { name: 'Adicionar' }).click()
  await expect(page.getByRole('alert')).toHaveText(MENSAGEM_SEM_PERMISSAO)

  expect(await consultar('select 1 from instituicao where nome_canonico = $1', [instituicao]))
    .toEqual([])
  expect(await consultar('select 1 from curso where nome = $1', [curso])).toEqual([])
})
