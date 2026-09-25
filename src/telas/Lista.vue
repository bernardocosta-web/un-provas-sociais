<script setup>
// Lista de depoimentos (spec §6.1): filtros a esquerda, resultados a
// direita, contagem sempre visivel. A URL e a fonte da verdade: a consulta
// do hash (#/depoimentos?...) vira estado (urlParaFiltros), o estado vira
// p_filtros (montarFiltros), e toda mudanca de filtro ou aba grava um hash
// novo (filtrosParaUrl) — a busca vira link salvavel e compartilhavel.
import { ref, computed, watch, onMounted } from 'vue'
import { montarFiltros, filtrosParaUrl, urlParaFiltros } from '../lib/filtros.js'
import { colunasDaAba, linhaDaLista, textoContagem } from '../lib/lista.js'
import { rotaDaLista } from '../lib/rotas.js'
import { mensagemDeErro } from '../lib/erros.js'
import { buscarDepoimentos, COLUNAS_LISTA } from '../dados/depoimentos.js'
import { listarInstituicoes, listarProvas, listarSimples } from '../dados/referencia.js'
import AbasFonte from '../componentes/AbasFonte.vue'
import PainelFiltros from '../componentes/PainelFiltros.vue'
import LinhaDepoimento from '../componentes/LinhaDepoimento.vue'

const props = defineProps({ consulta: { type: String, default: '' } })

// Espelho local da URL: atualizado na hora em mudar(), antes do hashchange
// (que e assincrono). Sem isso, duas mudancas seguidas (marcar um tipo e
// logo trocar "Tem print?") partiam do mesmo estado velho, e a segunda
// apagava a primeira.
const estado = ref(urlParaFiltros(props.consulta))
const colunas = computed(() => colunasDaAba(estado.value.aba))
const linhas = ref([])
const carregando = ref(true)
const erro = ref('')
// Erro ao carregar as opcoes (materias, instituicoes...) fica a parte: uma
// busca seguinte limpa `erro`, e os seletores continuariam vazios sem aviso.
const erroOpcoes = ref('')
const opcoes = ref({ instituicoes: [], provas: [], cursos: [], materias: [] })

function mudar(novo) {
  const consulta = filtrosParaUrl(novo)
  estado.value = urlParaFiltros(consulta)
  location.hash = rotaDaLista(consulta)
}

// Respostas fora de ordem (filtro trocado antes da busca anterior voltar):
// so a ultima pedida vale.
let ultima = 0
async function buscar() {
  const minha = ++ultima
  carregando.value = true
  erro.value = ''
  try {
    const dados = await buscarDepoimentos(montarFiltros(estado.value), { select: COLUNAS_LISTA })
    if (minha === ultima) linhas.value = dados.map(linhaDaLista)
  } catch (e) {
    if (minha === ultima) {
      linhas.value = []
      erro.value = mensagemDeErro(e)
    }
  } finally {
    if (minha === ultima) carregando.value = false
  }
}

async function carregarOpcoes() {
  try {
    const [instituicoes, provas, cursos, materias] = await Promise.all([
      listarInstituicoes(), listarProvas(), listarSimples('curso'), listarSimples('materia'),
    ])
    opcoes.value = { instituicoes, provas, cursos, materias }
  } catch (e) {
    erroOpcoes.value = `Não deu para carregar as opções dos filtros: ${mensagemDeErro(e)}`
  }
}

watch(() => props.consulta, (consulta) => {
  estado.value = urlParaFiltros(consulta)
  buscar()
})
onMounted(() => {
  carregarOpcoes()
  buscar()
})
</script>

<template>
  <section class="lista">
    <h2>Depoimentos</h2>
    <AbasFonte :aba="estado.aba" @mudar="mudar({ ...estado, aba: $event })" />
    <div class="corpo">
      <PainelFiltros :estado="estado" :opcoes="opcoes" @mudar="mudar" />
      <div class="resultados">
        <p class="contagem" role="status">
          {{ carregando ? 'Buscando…' : textoContagem(linhas.length) }}
        </p>
        <p v-if="erroOpcoes" role="alert">{{ erroOpcoes }}</p>
        <p v-if="erro" role="alert">{{ erro }}</p>
        <table v-if="linhas.length">
          <thead>
            <tr>
              <th>#</th>
              <th v-for="c in colunas" :key="c.chave" :class="{ destaque: c.destaque }">
                {{ c.titulo }}
              </th>
            </tr>
          </thead>
          <tbody>
            <LinhaDepoimento v-for="l in linhas" :key="l.id" :linha="l" :colunas="colunas" />
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.corpo {
  display: grid; grid-template-columns: minmax(16rem, 22rem) 1fr; gap: 1rem; align-items: start;
}
.contagem { font-weight: 600; }
table { border-collapse: collapse; width: 100%; }
th, td {
  border-bottom: 1px solid #e5e7eb; padding: 0.25rem 0.5rem; text-align: left; vertical-align: top;
}
.destaque { background: #fefce8; }
</style>
