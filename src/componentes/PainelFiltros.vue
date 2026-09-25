<script setup>
// Painel de filtros da lista (spec §6.1). Recebe o estado (lido da URL) e
// emite 'mudar' com um estado NOVO; a Lista grava na URL, e a URL volta
// como estado. A fonte nao e controle daqui: e a aba (AbasFonte.vue).
// Texto e anos emitem no `change` (Enter ou sair do campo), nao a cada tecla.
import { computed, reactive, watch } from 'vue'
import { TIPOS, STATUS, CANAIS } from '../lib/rotulos.js'
import { anoValido } from '../lib/normalizarFiltros.js'
import { comoOpcao } from '../lib/instituicoes.js'
import { alternar, booleanoParaCampo, campoParaBooleano, limparFiltros } from '../lib/painel.js'
import FiltroCadastros from './FiltroCadastros.vue'
import CondicoesNotas from './CondicoesNotas.vue'

const props = defineProps({
  estado: { type: Object, required: true },
  // { instituicoes, provas, cursos, materias } vindos de referencia.js
  opcoes: { type: Object, required: true },
})
const emit = defineEmits(['mudar'])

const GRUPOS = [
  { campo: 'tipos', rotulo: 'Tipo', opcoes: TIPOS },
  { campo: 'status', rotulo: 'Status', opcoes: STATUS },
  { campo: 'canais', rotulo: 'Canal', opcoes: CANAIS },
]
const ANOS = [['ano', 'Ano exato'], ['anoDe', 'De'], ['anoAte', 'Até']]
const SIM_NAO = [['temPrint', 'Tem print?'], ['temLinkOriginal', 'Tem link original?']]

const provas = computed(() => props.opcoes.provas.map(comoOpcao))
const cursos = computed(() => props.opcoes.cursos.map(comoOpcao))

// Rascunho dos campos digitados (texto e anos), ressincronizado a cada
// estado novo vindo da URL: voltar/avancar no historico, ou um valor que a
// normalizacao descartou (texto so de espacos, ano fora da faixa), deixam o
// campo igual ao filtro aplicado, nao ao que ficou digitado.
const rascunho = reactive({})
function sincronizar(estado) {
  rascunho.texto = estado.texto
  for (const [campo] of ANOS) rascunho[campo] = estado[campo] ?? ''
}
watch(() => props.estado, sincronizar, { immediate: true })

function mudar(campo, valor) {
  emit('mudar', { ...props.estado, [campo]: valor })
}

</script>

<template>
  <aside class="painel" aria-label="Filtros">
    <label>
      Texto
      <input v-model="rascunho.texto" type="search" @change="mudar('texto', rascunho.texto)" />
    </label>

    <fieldset v-for="g in GRUPOS" :key="g.campo">
      <legend>{{ g.rotulo }}</legend>
      <label v-for="o in g.opcoes" :key="o.valor">
        <input type="checkbox" :checked="estado[g.campo].includes(o.valor)"
               @change="mudar(g.campo, alternar(estado[g.campo], o.valor))" />
        {{ o.rotulo }}
      </label>
    </fieldset>

    <FiltroCadastros rotulo="Instituição aprovada" :opcoes="opcoes.instituicoes"
                     :model-value="estado.instituicoes" @update:model-value="mudar('instituicoes', $event)" />
    <FiltroCadastros rotulo="Prova" :opcoes="provas"
                     :model-value="estado.provas" @update:model-value="mudar('provas', $event)" />
    <FiltroCadastros rotulo="Curso" :opcoes="cursos"
                     :model-value="estado.cursos" @update:model-value="mudar('cursos', $event)" />

    <fieldset>
      <legend>Ano da participação</legend>
      <label v-for="[campo, rotulo] in ANOS" :key="campo">
        {{ rotulo }}
        <input v-model="rascunho[campo]" type="number" min="1990" max="2100"
               @change="mudar(campo, anoValido(rascunho[campo]))" />
      </label>
    </fieldset>

    <CondicoesNotas :notas="estado.notas" :materias="opcoes.materias" @mudar="mudar('notas', $event)" />

    <label v-for="[campo, rotulo] in SIM_NAO" :key="campo">
      {{ rotulo }}
      <select :value="booleanoParaCampo(estado[campo])"
              @change="mudar(campo, campoParaBooleano($event.target.value))">
        <option value="">Tanto faz</option>
        <option value="true">Sim</option>
        <option value="false">Não</option>
      </select>
    </label>

    <button type="button" @click="emit('mudar', limparFiltros(estado))">Limpar filtros</button>
  </aside>
</template>

<style scoped>
.painel { display: flex; flex-direction: column; gap: 0.5rem; }
.painel > label, fieldset label { display: block; }
</style>
