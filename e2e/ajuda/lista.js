// Apoio das specs da lista (Task 21): depoimentos montados direto no banco
// (pg, superusuario) — o teste e sobre filtrar, nao sobre cadastrar — e os
// passos do painel pela tela. Todo texto/nome leva o marcador (nome()),
// entao a limpeza (limpeza.js) leva as linhas e a logo enviada.
import { randomBytes } from 'node:crypto'
import { expect } from '@playwright/test'
import { obterChaveServico } from '../../testes/auth/ajuda.js'
import { consultar } from './banco.js'
import { ambienteLocal } from './ambiente.js'
import { gerarPng } from './imagem.js'

const id = async (sql, parametros) => Number((await consultar(sql, parametros))[0].id)

// participacoes: [{ prova, ano, notas: [{ materia, valor, escala }],
//                   resultados: [{ instituicao, situacao }] }]
export async function criarDepoimento({
  texto, fonte = 'MANUAL', link = null, autor = null, contato = null,
  autorizacao = 'NAO_INFORMADO', tipos = [], participacoes = [], data = null, print = null,
}) {
  const depoimento = await id(
    `insert into depoimento (texto_completo, fonte, link_original, autor_bruto,
       autor_contato_bruto, autorizacao_publicacao, data_depoimento, print_path)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [texto, fonte, link, autor, contato, autorizacao, data, print])
  for (const tipo of tipos) {
    await consultar('insert into depoimento_tipo (depoimento_id, tipo) values ($1, $2)', [depoimento, tipo])
  }
  for (const p of participacoes) {
    const participacao = await id(
      'insert into participacao (depoimento_id, prova_id, ano) values ($1, $2, $3) returning id',
      [depoimento, p.prova, p.ano ?? 2025])
    for (const n of p.notas ?? []) {
      await consultar(
        `insert into nota (participacao_id, materia_id, valor_original, escala)
         values ($1, $2, $3, $4)`, [participacao, n.materia, n.valor, n.escala ?? 'PERCENTUAL'])
    }
    for (const r of p.resultados ?? []) {
      await consultar(
        `insert into resultado (participacao_id, instituicao_id, situacao) values ($1, $2, $3)`,
        [participacao, r.instituicao, r.situacao ?? 'APROVADO'])
    }
  }
  return depoimento
}

// Sobe uma logo PNG para o bucket publico pela Storage API (service key lida
// em tempo de execucao) e grava o caminho na instituicao. A limpeza acha o
// arquivo pelo logo_path da instituicao marcada.
export async function darLogo(instituicao, cor) {
  const { url } = ambienteLocal()
  const chave = obterChaveServico()
  const caminho = `e2e-lista-${randomBytes(4).toString('hex')}.png`
  const resposta = await fetch(`${url}/storage/v1/object/logos/${caminho}`, {
    method: 'POST',
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'image/png' },
    body: gerarPng(cor),
  })
  if (!resposta.ok) throw new Error(`Storage recusou a logo: ${resposta.status} ${await resposta.text()}`)
  await consultar('update instituicao set logo_path = $1 where id = $2', [caminho, instituicao])
  return caminho
}

export const contagem = (page) => page.locator('p.contagem')
export const linhas = (page) => page.locator('tbody tr.linha')

export async function abrirLista(page, destino = './') {
  await page.goto(destino)
  await expect(page.getByRole('heading', { name: 'Depoimentos' })).toBeVisible()
  await expect(contagem(page)).not.toHaveText('Buscando…')
}

// Texto e anos emitem no change: preencher e sair do campo.
export async function preencherCampo(page, rotulo, valor) {
  const campo = page.getByLabel(rotulo, { exact: true })
  await campo.fill(valor)
  await campo.blur()
}

export async function filtrarTexto(page, texto) {
  await preencherCampo(page, 'Texto', texto)
}

export async function escolherCadastro(page, rotulo, nomeOpcao) {
  await page.getByLabel(rotulo, { exact: true }).fill(nomeOpcao)
  await page.getByRole('button', { name: nomeOpcao, exact: true }).click()
  await expect(page.getByRole('button', { name: `Remover ${nomeOpcao}` })).toBeVisible()
}

export async function adicionarPercentual(page, materia, condicao) {
  await page.getByLabel('Matéria (percentual)').selectOption({ label: materia })
  await page.getByLabel('Condição').selectOption({ label: condicao })
  await page.getByRole('button', { name: 'Adicionar percentual' }).click()
}

export async function adicionarTri(page, materia, minimo) {
  await page.getByLabel('Matéria (TRI)').selectOption({ label: materia })
  await page.getByLabel('Pontuação mínima').fill(String(minimo))
  await page.getByRole('button', { name: 'Adicionar TRI' }).click()
}
