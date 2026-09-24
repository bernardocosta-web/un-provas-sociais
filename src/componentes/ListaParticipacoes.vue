<script setup>
// Participações da ficha: prova (combobox), ano, notas e resultados. Guarda
// as listas de referência e o "criar na hora" (spec 6.2: criar instituição,
// prova ou curso sem sair da tela).
import { reactive, ref, computed, onMounted } from 'vue'
import {
  listarSimples, listarInstituicoes, criarSimples, criarInstituicao,
} from '../dados/referencia.js'
import { comoOpcao } from '../lib/instituicoes.js'
import { aplicarProva, novaParticipacao } from '../lib/formulario.js'
import { mensagemDeErro } from '../lib/erros.js'
import CaixaBusca from './CaixaBusca.vue'
import ListaNotas from './ListaNotas.vue'
import ListaResultados from './ListaResultados.vue'

const props = defineProps({
  participacoes: { type: Array, required: true },
})

const listas = reactive({ provas: [], materias: [], cursos: [], instituicoes: [] })
const erro = ref('')

onMounted(async () => {
  try {
    [listas.provas, listas.materias, listas.cursos, listas.instituicoes] = await Promise.all([
      listarSimples('prova'), listarSimples('materia'), listarSimples('curso'),
      listarInstituicoes(),
    ])
  } catch (e) {
    erro.value = mensagemDeErro(e)
  }
})

const opcoesProva = computed(() => listas.provas.map(comoOpcao))

function provaDe(participacao) {
  return listas.provas.find((p) => p.id === participacao.prova_id) ?? null
}

function aoEscolherProva(participacao, id) {
  aplicarProva(participacao, listas.provas.find((p) => p.id === id) ?? null)
}

// Prova e curso por criarSimples; instituição pelo caminho próprio
// (criarInstituicao): a coluna dela é nome_canonico, não nome.
async function criarNaHora(tipo, termo) {
  erro.value = ''
  try {
    if (tipo === 'instituicao') {
      const instituicao = await criarInstituicao(termo)
      listas.instituicoes.push(instituicao)
      return instituicao.id
    }
    const item = await criarSimples(tipo, termo)
    listas[tipo === 'prova' ? 'provas' : 'cursos'].push(item)
    return item.id
  } catch (e) {
    erro.value = mensagemDeErro(e)
    return null
  }
}

async function criarProva(participacao, termo) {
  const id = await criarNaHora('prova', termo)
  if (id != null) aoEscolherProva(participacao, id)
}

function remover(indice) {
  props.participacoes.splice(indice, 1)
}
</script>

<template>
  <section>
    <h3>Participações</h3>
    <p v-if="erro" role="alert">{{ erro }}</p>
    <article v-for="(participacao, indice) in participacoes" :key="indice">
      <CaixaBusca
        :model-value="participacao.prova_id"
        rotulo="Prova"
        :opcoes="opcoesProva"
        @update:model-value="(id) => aoEscolherProva(participacao, id)"
        @criar="(termo) => criarProva(participacao, termo)"
      />
      <label>
        Ano
        <input v-model="participacao.ano" type="number" step="1" min="1990" max="2100" />
      </label>
      <button type="button" @click="remover(indice)">Remover participação</button>

      <ListaNotas :notas="participacao.notas" :materias="listas.materias"
                  :prova="provaDe(participacao)" />
      <ListaResultados
        :resultados="participacao.resultados"
        :instituicoes="listas.instituicoes"
        :cursos="listas.cursos"
        :criar-na-hora="criarNaHora"
      />
    </article>
    <button type="button" @click="participacoes.push(novaParticipacao())">+ Participação</button>
  </section>
</template>
