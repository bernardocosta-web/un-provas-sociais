<script setup>
// Autocompletar de multipla escolha para os filtros de instituicao, prova
// e curso (spec §6.1). Opcoes no formato { id, nome_canonico, apelidos }
// (prova e curso passam por comoOpcao antes). Nao cria cadastro: filtro so
// escolhe o que existe.
import { ref, computed } from 'vue'
import { sugerirOpcoes } from '../lib/instituicoes.js'

const props = defineProps({
  rotulo: { type: String, required: true },
  opcoes: { type: Array, required: true },
  modelValue: { type: Array, required: true },
})
const emit = defineEmits(['update:modelValue'])

const termo = ref('')

const escolhidas = computed(() =>
  props.modelValue.map((id) => props.opcoes.find((o) => o.id === id) ?? { id, nome_canonico: `#${id}` }))
const sugestoes = computed(() => {
  if (!termo.value.trim()) return []
  const livres = props.opcoes.filter((o) => !props.modelValue.includes(o.id))
  return sugerirOpcoes(livres, termo.value)
})

function adicionar(opcao) {
  emit('update:modelValue', [...props.modelValue, opcao.id])
  termo.value = ''
}

function remover(id) {
  emit('update:modelValue', props.modelValue.filter((v) => v !== id))
}
</script>

<template>
  <div class="filtro-cadastros">
    <label>
      {{ rotulo }}
      <input v-model="termo" :placeholder="`Buscar ${rotulo.toLowerCase()}…`"
             @keydown.esc="termo = ''" />
    </label>
    <ul v-if="sugestoes.length" class="sugestoes">
      <li v-for="opcao in sugestoes" :key="opcao.id">
        <button type="button" @click="adicionar(opcao)">{{ opcao.nome_canonico }}</button>
      </li>
    </ul>
    <ul v-if="escolhidas.length" class="escolhidas">
      <li v-for="opcao in escolhidas" :key="opcao.id">
        {{ opcao.nome_canonico }}
        <button type="button" :aria-label="`Remover ${opcao.nome_canonico}`"
                @click="remover(opcao.id)">×</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.sugestoes, .escolhidas { list-style: none; padding: 0; margin: 0.25rem 0; }
.escolhidas li { display: inline-block; margin-right: 0.5rem; }
</style>
