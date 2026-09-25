// Marco 5 / Task 21 — o criterio de pronto do subprojeto (spec §3 e §6.1):
// "100% em Fisica" E "aprovado no ITA", em participacoes diferentes, acha o
// depoimento; a URL guarda os filtros; linha abre a ficha e o voltar
// devolve a lista; logos das aprovadas vem do bucket publico; estranho ve
// lista vazia sem quebrar. Filtros um a um: lista-filtros.spec.js.
import { test, expect } from './ajuda/teste.js'
import { nome } from './ajuda/marcador.js'
import { criarInstituicao, criarProva, criarMateria } from './ajuda/cadastros.js'
import { limparDados } from './ajuda/limpeza.js'
import { consultar } from './ajuda/banco.js'
import {
  criarDepoimento, darLogo, contagem, linhas, abrirLista, escolherCadastro, adicionarPercentual,
  filtrarTexto,
} from './ajuda/lista.js'

test.afterAll(limparDados)

test('criterio de pronto: 100% em Fisica E aprovado no ITA, em participacoes diferentes', async ({ page, entrarComo }) => {
  const fisica = nome('Fisica')
  const ita = nome('ITA')
  const materia = await criarMateria(fisica)
  const instituicao = await criarInstituicao(ita)
  const logo = await darLogo(instituicao, [20, 90, 200])
  const enem = await criarProva(nome('ENEM lista'))
  const vestibular = await criarProva(nome('Vestibular ITA'), instituicao)

  const textoAlvo = nome('Gabaritou fisica no ENEM e passou no ITA')
  const alvo = await criarDepoimento({
    texto: textoAlvo,
    tipos: ['APROVACAO'],
    participacoes: [
      { prova: enem, ano: 2025, notas: [{ materia, valor: 100 }] },
      { prova: vestibular, ano: 2025, resultados: [{ instituicao }] },
    ],
  })
  // Controles: falta um dos dois fatos.
  const soNota = nome('So gabaritou fisica')
  await criarDepoimento({
    texto: soNota, participacoes: [{ prova: enem, notas: [{ materia, valor: 100 }] }],
  })
  const quaseNota = nome('Passou no ITA com 90 em fisica')
  await criarDepoimento({
    texto: quaseNota,
    participacoes: [{ prova: vestibular, notas: [{ materia, valor: 90 }], resultados: [{ instituicao }] }],
  })

  await entrarComo('membro')
  await abrirLista(page)

  await adicionarPercentual(page, fisica, '= 100%')
  await expect(contagem(page)).toHaveText('2 depoimentos')
  await escolherCadastro(page, 'Instituição aprovada', ita)
  await expect(contagem(page)).toHaveText('1 depoimento')
  await expect(linhas(page)).toHaveCount(1)
  await expect(linhas(page)).toContainText(textoAlvo)
  await expect(page.getByText(soNota)).toHaveCount(0)
  await expect(page.getByText(quaseNota)).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`#/depoimentos\\?.*instituicoes=${instituicao}`))
  await expect(page).toHaveURL(new RegExp(`notas=${materia}%3A100%3APERCENTUAL%3A%3D`))

  // Logo da aprovada: URL publica do bucket logos, carregada de verdade.
  const imagem = linhas(page).locator('td[data-coluna="logos"] img')
  await expect(imagem).toHaveAttribute('src', new RegExp(`/storage/v1/object/public/logos/${logo}$`))
  await expect(imagem).toHaveAttribute('alt', ita)
  await expect.poll(() => imagem.evaluate((img) => img.complete && img.naturalWidth)).toBeGreaterThan(0)

  // A URL copiada, aberta noutra aba, restaura os mesmos filtros e resultado.
  const endereco = page.url()
  const outra = await page.context().newPage()
  await outra.goto(endereco)
  await expect(contagem(outra)).toHaveText('1 depoimento')
  await expect(linhas(outra)).toContainText(textoAlvo)
  await expect(outra.getByRole('button', { name: `Remover ${ita}` })).toBeVisible()
  await expect(outra.getByText(`${fisica} = 100%`)).toBeVisible()
  await outra.close()

  // Linha abre a ficha; voltar (historico) devolve a lista com os filtros.
  await linhas(page).first().click()
  await expect(page).toHaveURL(new RegExp(`#/ficha/${alvo}$`))
  await expect(page.getByRole('heading', { name: `Depoimento #${alvo}` })).toBeVisible()
  await expect(page.getByLabel('Texto completo')).toHaveValue(textoAlvo)
  await page.goBack()
  await expect(page).toHaveURL(endereco)
  await expect(contagem(page)).toHaveText('1 depoimento')
  await expect(linhas(page)).toContainText(textoAlvo)
})

test('hash vazio abre a lista; Voltar da ficha e o link Depoimentos levam a ela', async ({ page, entrarComo }) => {
  await entrarComo('membro')
  await abrirLista(page)
  await expect(page.getByRole('tab', { name: 'Todos' })).toHaveAttribute('aria-selected', 'true')

  await page.goto('#/ficha/999999')
  await expect(page.getByText('Depoimento não encontrado.')).toBeVisible()
  await page.getByRole('link', { name: 'Voltar' }).click()
  await expect(page.getByRole('heading', { name: 'Depoimentos' })).toBeVisible()

  await page.getByRole('link', { name: 'Cadastros' }).click()
  await expect(page).toHaveURL(/#\/cadastros$/)
  await expect(page.getByRole('heading', { name: 'Instituições' })).toBeVisible()
  await page.getByRole('link', { name: 'Depoimentos' }).click()
  await expect(page).toHaveURL(/#\/depoimentos$/)
  await expect(page.getByRole('heading', { name: 'Depoimentos' })).toBeVisible()
})

test('"Novo depoimento" estando ja na ficha nova limpa o formulario', async ({ page, entrarComo }) => {
  await entrarComo('membro')
  await page.goto('#/ficha')
  await expect(page.getByRole('heading', { name: 'Novo depoimento' })).toBeVisible()
  await page.getByLabel('Texto completo').fill(nome('Rascunho que deve sumir'))
  await page.getByRole('link', { name: 'Novo depoimento' }).click()
  await expect(page).toHaveURL(/#\/ficha$/)
  await expect(page.getByLabel('Texto completo')).toHaveValue('')
})

// M5-A item 3 (pedido do dono): o botao "Voltar a lista" da ficha devolve
// aos mesmos filtros e a mesma aba de antes, nao a lista em branco.
test('filtrar + trocar de aba, abrir a ficha e "Voltar à lista" devolve os mesmos filtros e aba', async ({ page, entrarComo }) => {
  const recorte = nome('Voltar lista')
  await criarDepoimento({ texto: `${recorte} manual`, fonte: 'MANUAL' })
  await criarDepoimento({ texto: `${recorte} google`, fonte: 'GOOGLE_REVIEW' })

  await entrarComo('membro')
  await abrirLista(page)
  await filtrarTexto(page, recorte)
  await page.getByRole('tab', { name: 'Manual' }).click()
  await expect(contagem(page)).toHaveText('1 depoimento')
  const endereco = page.url()

  await linhas(page).first().click()
  await expect(page.getByRole('heading', { name: /^Depoimento #/ })).toBeVisible()

  await page.getByRole('link', { name: 'Voltar à lista' }).click()
  await expect(page).toHaveURL(endereco)
  await expect(page.getByRole('tab', { name: 'Manual' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByLabel('Texto', { exact: true })).toHaveValue(recorte)
  await expect(contagem(page)).toHaveText('1 depoimento')
  await expect(linhas(page)).toContainText(`${recorte} manual`)
})

test('estranho ve a lista vazia, sem erro', async ({ page, entrarComo }) => {
  // Garante que ha dado no banco que o estranho NAO pode ver.
  await criarDepoimento({ texto: nome('Invisivel para estranho') })
  await entrarComo('estranho')
  await abrirLista(page)
  await expect(contagem(page)).toHaveText('0 depoimentos')
  await expect(linhas(page)).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('acima do max_rows (1000) a contagem e a exata do banco, com aviso para refinar', async ({ page, entrarComo }) => {
  // 1001 depoimentos num insert so (rapido); o PostgREST devolve no maximo
  // 1000 linhas, mas o total vem do count exato da mesma chamada.
  const recorte = nome('Volume')
  await consultar(
    `insert into depoimento (texto_completo, fonte)
     select $1 || ' ' || n, 'MANUAL' from generate_series(1, 1001) n`, [recorte])
  try {
    await entrarComo('membro')
    await abrirLista(page, `#/depoimentos?q=${encodeURIComponent(recorte)}`)
    await expect(contagem(page)).toHaveText('Mostrando 1000 de 1001 — refine os filtros')
    await expect(linhas(page)).toHaveCount(1000)

    await consultar('delete from depoimento where texto_completo = $1', [`${recorte} 1001`])
    await page.reload()
    await expect(contagem(page)).toHaveText('1000 depoimentos')
  } finally {
    await consultar('delete from depoimento where texto_completo like $1', [`${recorte}%`])
  }
})
