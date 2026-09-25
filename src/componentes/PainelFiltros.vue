<script setup>
// Painel de filtros da lista (spec §6.1). Recebe o estado (lido da URL) e
// emite 'mudar' com um estado NOVO; a Lista grava na URL, e a URL volta
// como estado. A fonte nao e controle daqui: e a aba (AbasFonte.vue).
// Texto e anos emitem no `change` (Enter ou sair do campo), nao a cada tecla.
import { computed } from 'vue'
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

const provas = computed(() => props.opcoes.provas.map(comoOpcao))
const cursos = computed(() => props.opcoes.cursos.map(comoOpcao))

function mudar(campo, valor) {
  emit('mudar', { ...props.estado, [campo]: valor })
}

const GRUPOS = [
  { campo: 'tipos', rotulo: 'Tipo', opcoes: TIPOS },
  { campo: 'status', rotulo: 'Status', opcoes: STATUS },
  { campo: 'canais', rotulo: 'Canal', opcoes: CANAIS },
]
const ANOS = [['ano', 'Ano exato'], ['anoDe', 'De'], ['anoAte', 'Até']]
const SIM_NAO = [['temPrint', 'Tem print?'], ['temLinkOriginal', 'Tem link original?']]
</script>

<template>
  <aside class="painel" aria-label="Filtros">
    <label>
      Texto
      <input type="search" :value="estado.texto" @change="mudar('texto', $event.target.value)" />
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
        <input type="number" min="1990" max="2100" :value="estado[campo] ?? ''"
               @change="mudar(campo, anoValido($event.target.value))" />
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
