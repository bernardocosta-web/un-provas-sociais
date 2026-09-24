<script setup>
// Notas de uma participação. O campo "máximo" só existe em PONTOS (spec 6.2:
// "Escolhido percentual, o campo máximo some"); prepararFicha descarta um
// máximo que tenha sobrado de outra escala.
import { novaNota } from '../lib/formulario.js'
import { ESCALAS } from '../lib/rotulos.js'

const props = defineProps({
  notas: { type: Array, required: true },
  materias: { type: Array, required: true },
  // Prova da participação (ou null): dá a escala padrão da nota nova.
  prova: { type: Object, default: null },
})

function adicionar() {
  props.notas.push(novaNota(props.prova))
}

function remover(indice) {
  props.notas.splice(indice, 1)
}
</script>

<template>
  <fieldset>
    <legend>Notas</legend>
    <div v-for="(nota, indice) in notas" :key="nota._chave">
      <label>
        Matéria
        <select v-model="nota.materia_id">
          <option value="">—</option>
          <option v-for="m in materias" :key="m.id" :value="m.id">{{ m.nome }}</option>
        </select>
      </label>
      <label>
        Valor
        <input v-model="nota.valor_original" type="number" step="0.01" min="0" />
      </label>
      <label>
        Escala
        <select v-model="nota.escala">
          <option value="">—</option>
          <option v-for="e in ESCALAS" :key="e.valor" :value="e.valor">{{ e.rotulo }}</option>
        </select>
      </label>
      <label v-if="nota.escala === 'PONTOS'">
        Máximo
        <input v-model="nota.valor_maximo" type="number" step="0.01" min="0" />
      </label>
      <button type="button" @click="remover(indice)">Remover nota</button>
    </div>
    <button type="button" @click="adicionar">+ Nota</button>
  </fieldset>
</template>
