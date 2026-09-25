<script setup>
// Condicoes de nota do painel de filtros. Percentual e TRI sao controles
// SEPARADOS (spec §6.1): percentual = materia + operador (=100%, >=90%,
// >=70%, livre); TRI = materia + pontuacao minima. As condicoes somam (AND
// no nivel do depoimento). Rascunho local: so vira filtro (e URL) quando a
// condicao esta completa e o usuario clica Adicionar.
import { reactive } from 'vue'
import {
  PRESETS_PERCENTUAL, condicaoPercentual, condicaoTri, descreverCondicao, removerCondicao,
} from '../lib/painel.js'

const props = defineProps({
  notas: { type: Array, required: true },
  materias: { type: Array, required: true },
})
const emit = defineEmits(['mudar'])

const percentual = reactive({ materia: '', preset: '=100', operador: '>=', minimo: '' })
const tri = reactive({ materia: '', minimo: '' })

function adicionar(condicao) {
  if (condicao) emit('mudar', [...props.notas, condicao])
}
</script>

<template>
  <fieldset>
    <legend>Notas</legend>
    <ul v-if="notas.length" class="condicoes">
      <li v-for="(nota, indice) in notas" :key="indice">
        {{ descreverCondicao(nota, materias) }}
        <button type="button" :aria-label="`Remover condição ${descreverCondicao(nota, materias)}`"
                @click="emit('mudar', removerCondicao(notas, indice))">×</button>
      </li>
    </ul>

    <div class="percentual">
      <strong>Percentual</strong>
      <label>
        Matéria (percentual)
        <select v-model="percentual.materia">
          <option value="">—</option>
          <option v-for="m in materias" :key="m.id" :value="m.id">{{ m.nome }}</option>
        </select>
      </label>
      <label>
        Condição
        <select v-model="percentual.preset">
          <option v-for="p in PRESETS_PERCENTUAL" :key="p.chave" :value="p.chave">{{ p.rotulo }}</option>
        </select>
      </label>
      <template v-if="percentual.preset === 'livre'">
        <label>
          Operador
          <select v-model="percentual.operador">
            <option value=">=">≥</option>
            <option value="=">=</option>
          </select>
        </label>
        <label>Percentual <input v-model="percentual.minimo" type="number" min="0" max="100" /></label>
      </template>
      <button type="button" :disabled="!condicaoPercentual(percentual)"
              @click="adicionar(condicaoPercentual(percentual))">Adicionar percentual</button>
    </div>

    <div class="tri">
      <strong>TRI</strong>
      <label>
        Matéria (TRI)
        <select v-model="tri.materia">
          <option value="">—</option>
          <option v-for="m in materias" :key="m.id" :value="m.id">{{ m.nome }}</option>
        </select>
      </label>
      <label>Pontuação mínima <input v-model="tri.minimo" type="number" min="0" max="1000" /></label>
      <button type="button" :disabled="!condicaoTri(tri)"
              @click="adicionar(condicaoTri(tri))">Adicionar TRI</button>
    </div>
  </fieldset>
</template>

<style scoped>
.condicoes { list-style: none; padding: 0; }
.percentual, .tri { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: end; margin: 0.25rem 0; }
</style>
