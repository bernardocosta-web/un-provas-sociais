// Marco 3 + 17b + 17c — aba Instituições: logo no bucket, apelidos,
// colisões, mesclar e remover.
import { test, expect } from './ajuda/teste.js'
import { nome } from './ajuda/marcador.js'
import { arquivoPng } from './ajuda/imagem.js'
import { consultar, arquivosNoBucket, instituicaoPorNome } from './ajuda/banco.js'
import { criarInstituicao, criarProva } from './ajuda/cadastros.js'
import { limparDados } from './ajuda/limpeza.js'
import {
  linha, abrirCadastros, preencherESalvar, criarPelaTela, esperarLogoCarregada,
} from './ajuda/instituicoes.js'

const MENSAGEM_DUPLICADO = 'Já existe um cadastro com esse nome ou apelido.'

test.afterAll(limparDados)

test.beforeEach(async ({ page, entrarComo }) => {
  await entrarComo('membro')
  await abrirCadastros(page)
})

test('criar instituição com apelido e logo: aparece com a logo e o arquivo está no bucket', async ({ page }) => {
  const nomeCanonico = nome('Inst logo')
  const apelido = nome('Apelido')
  await criarPelaTela(page, { nomeCanonico, apelidos: [apelido], logo: arquivoPng([200, 30, 30]) })

  const gravada = await instituicaoPorNome(nomeCanonico)
  expect(gravada.apelidos).toEqual([apelido])
  expect(gravada.logo_path).toMatch(/\.webp$/)
  expect(await arquivosNoBucket('logos')).toContain(gravada.logo_path)
  await expect(linha(page, nomeCanonico)).toContainText(apelido)
  await esperarLogoCarregada(page, nomeCanonico, gravada.logo_path)
})

test('trocar a logo apaga o arquivo antigo do bucket', async ({ page }) => {
  const nomeCanonico = nome('Inst troca')
  await criarPelaTela(page, { nomeCanonico, logo: arquivoPng([30, 200, 30]) })
  const antiga = (await instituicaoPorNome(nomeCanonico)).logo_path

  await linha(page, nomeCanonico).getByRole('button', { name: 'Editar' }).click()
  await expect(page.getByLabel('Nome canônico')).toHaveValue(nomeCanonico)
  await preencherESalvar(page, { logo: arquivoPng([30, 30, 200]) })
  await expect(page.getByLabel('Nome canônico')).toHaveCount(0)

  const nova = (await instituicaoPorNome(nomeCanonico)).logo_path
  expect(nova).not.toBe(antiga)
  const arquivos = await arquivosNoBucket('logos')
  expect(arquivos).toContain(nova)
  expect(arquivos).not.toContain(antiga)
  await esperarLogoCarregada(page, nomeCanonico, nova)
})

test('apelido repetido é recusado em pt-BR, nada muda e nenhum arquivo novo sobra', async ({ page }) => {
  const dona = nome('Inst dona')
  const apelido = nome('Apelido disputado')
  await criarPelaTela(page, { nomeCanonico: dona, apelidos: [apelido] })
  const antes = await arquivosNoBucket('logos')

  const outra = nome('Inst outra')
  await page.getByRole('button', { name: 'Nova instituição' }).click()
  await preencherESalvar(page, { nomeCanonico: outra, apelidos: [apelido], logo: arquivoPng([9, 9, 9]) })
  await expect(page.getByRole('alert')).toHaveText(MENSAGEM_DUPLICADO)

  expect(await instituicaoPorNome(outra)).toBeNull()
  expect((await instituicaoPorNome(dona)).apelidos).toEqual([apelido])
  // A remoção do arquivo novo é depois da falha: espera ela acontecer.
  await expect.poll(() => arquivosNoBucket('logos')).toEqual(antes)
})

test('nome com espaço no fim colide com o existente', async ({ page }) => {
  const existente = nome('Inst espaco')
  await criarPelaTela(page, { nomeCanonico: existente })

  await page.getByRole('button', { name: 'Nova instituição' }).click()
  await preencherESalvar(page, { nomeCanonico: `${existente} ` })
  await expect(page.getByRole('alert')).toHaveText(MENSAGEM_DUPLICADO)
  const linhas = await consultar(
    'select count(*)::int as n from instituicao where btrim(nome_canonico) = $1', [existente])
  expect(linhas[0].n).toBe(1)
})

test('Editar e depois Nova instituição mostra o formulário vazio', async ({ page }) => {
  const nomeCanonico = nome('Inst editar')
  const apelido = nome('Apelido editar')
  await criarPelaTela(page, { nomeCanonico, apelidos: [apelido], logo: arquivoPng([120, 120, 0]) })

  await linha(page, nomeCanonico).getByRole('button', { name: 'Editar' }).click()
  await expect(page.getByLabel('Nome canônico')).toHaveValue(nomeCanonico)
  await expect(page.getByRole('img', { name: 'Logo atual' })).toBeVisible()

  await page.getByRole('button', { name: 'Nova instituição' }).click()
  await expect(page.getByLabel('Nome canônico')).toHaveValue('')
  await expect(page.locator('form fieldset li')).toHaveCount(0)
  await expect(page.getByRole('img', { name: 'Logo atual' })).toHaveCount(0)
})

test('apelido igual ao nome de outra instituição é recusado com a mensagem da 0013', async ({ page }) => {
  const outra = nome('Inst nome ocupado')
  await criarPelaTela(page, { nomeCanonico: outra })

  const nova = nome('Inst com apelido errado')
  await page.getByRole('button', { name: 'Nova instituição' }).click()
  await preencherESalvar(page, { nomeCanonico: nova, apelidos: [outra] })
  await expect(page.getByRole('alert'))
    .toHaveText(`o apelido "${outra}" já é o nome de outra instituição: "${outra}"`)
  expect(await instituicaoPorNome(nova)).toBeNull()
})

test('mesclar: perdedora some, nome vira apelido, a prova passa à vencedora e a logo sai do bucket', async ({ page }) => {
  const vencedora = nome('Inst vencedora')
  const perdedora = nome('Inst perdedora')
  await criarPelaTela(page, { nomeCanonico: vencedora })
  await criarPelaTela(page, { nomeCanonico: perdedora, logo: arquivoPng([0, 90, 90]) })
  const { id: idPerdedora, logo_path: logoPerdedora } = await instituicaoPorNome(perdedora)
  const prova = nome('Prova da perdedora')
  await criarProva(prova, idPerdedora)

  await linha(page, perdedora).getByRole('button', { name: 'Mesclar' }).click()
  const grupo = page.getByRole('group', { name: 'Mesclar instituição' })
  await grupo.getByRole('combobox').selectOption({ label: vencedora })
  await grupo.getByRole('button', { name: 'Confirmar mesclagem' }).click()

  await expect(grupo).toHaveCount(0)
  await expect(linha(page, perdedora)).toHaveCount(0)
  await expect(linha(page, vencedora)).toContainText(perdedora)
  expect((await instituicaoPorNome(vencedora)).apelidos).toEqual([perdedora])
  await expect.poll(() => arquivosNoBucket('logos')).not.toContain(logoPerdedora)

  await page.getByRole('button', { name: 'Provas' }).click()
  await expect(page.locator('li').filter({ hasText: prova })).toContainText(`— ${vencedora}`)
})

// Com a 0013, "nome da perdedora = apelido de uma terceira" não nasce pela
// app (nem pelo SQL comum: o trigger adiado recusa no commit). A recusa da
// mesclagem é defesa em profundidade para dado antigo; o cenário é forjado
// no banco com os triggers desligados (session_replication_role = replica)
// só para conferir a mensagem na tela.
test('mesclar é recusado quando o nome da perdedora é apelido de uma terceira', async ({ page }) => {
  const vencedora = nome('Inst V')
  const perdedora = nome('Inst P')
  const terceira = nome('Inst T')
  await criarInstituicao(vencedora)
  await criarInstituicao(perdedora)
  const idTerceira = await criarInstituicao(terceira)
  await consultar(`
    do $$ begin
      set local session_replication_role = replica;
      insert into instituicao_apelido (instituicao_id, apelido) values (${idTerceira}, '${perdedora}');
    end $$`)
  await abrirCadastros(page)

  await linha(page, perdedora).getByRole('button', { name: 'Mesclar' }).click()
  const grupo = page.getByRole('group', { name: 'Mesclar instituição' })
  await grupo.getByRole('combobox').selectOption({ label: vencedora })
  await grupo.getByRole('button', { name: 'Confirmar mesclagem' }).click()
  await expect(grupo.getByRole('alert'))
    .toHaveText(`não dá para mesclar: o apelido "${perdedora}" já pertence a "${terceira}"`)

  expect(await instituicaoPorNome(perdedora)).not.toBeNull()
  expect((await instituicaoPorNome(vencedora)).apelidos).toEqual([])
})

test('remover instituição sem uso some e leva a logo do bucket', async ({ page }) => {
  const nomeCanonico = nome('Inst remover')
  await criarPelaTela(page, { nomeCanonico, logo: arquivoPng([50, 0, 50]) })
  const { logo_path: logo } = await instituicaoPorNome(nomeCanonico)
  expect(await arquivosNoBucket('logos')).toContain(logo)

  await linha(page, nomeCanonico).getByRole('button', { name: 'Remover' }).click()
  await expect(linha(page, nomeCanonico)).toHaveCount(0)
  expect(await instituicaoPorNome(nomeCanonico)).toBeNull()
  await expect.poll(() => arquivosNoBucket('logos')).not.toContain(logo)
})

test('remover instituição em uso é recusado dizendo onde e sugerindo Mesclar', async ({ page }) => {
  const nomeCanonico = nome('Inst em uso')
  const id = await criarInstituicao(nomeCanonico)
  await criarProva(nome('Prova usa inst'), id)
  await abrirCadastros(page)

  await linha(page, nomeCanonico).getByRole('button', { name: 'Remover' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    `"${nomeCanonico}" está em uso em 1 prova(s). Para juntar com outra instituição, use Mesclar.`)
  await expect(linha(page, nomeCanonico)).toHaveCount(1)
  expect(await instituicaoPorNome(nomeCanonico)).not.toBeNull()
})
