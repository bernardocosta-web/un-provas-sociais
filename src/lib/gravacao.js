// Sequencia de gravacao da ficha com troca de print (Task 20, Step 5).
// Logica pura: as operacoes de I/O chegam injetadas (a Ficha passa as de
// src/dados/depoimentos.js), para a ordem ser testavel sem rede.
//
//   1. validar primeiro: ficha invalida nao sobe nada para o bucket;
//   2. print novo? enviar com nome unico (o bucket prints nao tem UPDATE);
//   3. salvar com o caminho novo (ou o antigo, se nao houve troca);
//   4. so depois de salvar, remover o antigo.
// Se salvar falhar, remove o NOVO (tambem em depoimento novo), nunca o
// antigo: o print ja salvo continua valendo. Falha nessas remocoes deixa
// um arquivo orfao no bucket, e so — nao troca o resultado nem o erro.
import { validarDepoimento } from './validacao.js'

export async function gravarFicha(ficha, printNovo, { enviar, salvar, remover, nomeUnico }) {
  const erros = validarDepoimento(ficha)
  if (erros.length) return { erros }

  const antigo = ficha.print_path || null
  let novo = null
  let id
  try {
    if (printNovo) novo = await enviar(printNovo, nomeUnico())
    id = await salvar({ ...ficha, print_path: novo ?? antigo })
  } catch (erro) {
    if (novo) await remover(novo).catch(() => {})
    throw erro
  }
  if (novo && antigo) await remover(antigo).catch(() => {})
  return { erros: [], id, print_path: novo ?? antigo }
}
