<script setup>
// Abas por fonte (spec §6.1). A aba E o filtro de fonte (emenda
// 2026-09-24): "Todos" nao filtra, as outras mostram uma fonte so. Trocar
// de aba mantem os demais filtros — quem troca e a Lista, que so muda `aba`.
import { ABAS } from '../lib/lista.js'

defineProps({ aba: { type: String, required: true } })
const emit = defineEmits(['mudar'])
</script>

<template>
  <div role="tablist" aria-label="Fonte" class="abas">
    <button v-for="a in ABAS" :key="a.valor" type="button" role="tab"
            :aria-selected="a.valor === aba" :class="{ ativa: a.valor === aba }"
            @click="emit('mudar', a.valor)">
      {{ a.rotulo }}
    </button>
  </div>
</template>

<style scoped>
.abas { display: flex; gap: 0.25rem; margin-bottom: 0.5rem; }
.ativa { font-weight: 700; text-decoration: underline; }
</style>
