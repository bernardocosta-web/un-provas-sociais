<script setup>
// Combobox da ficha (instituição, prova, curso): busca por nome/apelido com
// sugerirOpcoes() e oferece "criar na hora" quando nada bate exatamente.
// Recebe opções já no formato { id, nome_canonico, apelidos } (prova e curso
// passam por comoOpcao antes). Criar é com quem usa: emite 'criar' com o termo.
import { ref, computed } from 'vue'
import { sugerirOpcoes, existeExato } from '../lib/instituicoes.js'

const props = defineProps({
  opcoes: { type: Array, required: true },
  modelValue: { type: [Number, String], default: '' },
  rotulo: { type: String, required: true },
  // Para mostrar o que já está escolhido mesmo fora das sugestões (ex.:
  // instituição inativa, que não é oferecida mas pode estar gravada).
  conhecidas: { type: Array, default: null },
})
const emit = defineEmits(['update:modelValue', 'criar'])

const termo = ref('')
const aberta = ref(false)

const todas = computed(() => props.conhecidas ?? props.opcoes)
const selecionada = computed(() => todas.value.find((o) => o.id === props.modelValue))
const sugestoes = computed(() => sugerirOpcoes(props.opcoes, termo.value))
// Compara com todas: criar o nome de uma inativa só daria "já existe".
const podeCriar = computed(() =>
  termo.value.trim() !== '' && !existeExato(todas.value, termo.value))

function abrir() {
  termo.value = ''
  aberta.value = true
}

function escolher(opcao) {
  emit('update:modelValue', opcao.id)
  aberta.value = false
}

function criar() {
  emit('criar', termo.value.trim())
  aberta.value = false
}

function limpar() {
  emit('update:modelValue', '')
}
</script>

<template>
  <span class="caixa-busca">
    <template v-if="!aberta">
      {{ rotulo }}:
      <strong v-if="selecionada">{{ selecionada.nome_canonico }}</strong>
      <em v-else>nenhum(a)</em>
      <button type="button" @click="abrir">{{ selecionada ? 'Trocar' : 'Escolher' }}</button>
      <button v-if="selecionada" type="button" @click="limpar">Limpar</button>
    </template>
    <template v-else>
      <label>
        {{ rotulo }}
        <input v-model="termo" :placeholder="`Buscar ${rotulo.toLowerCase()}…`"
               @keydown.esc="aberta = false" />
      </label>
      <button type="button" @click="aberta = false">Cancelar</button>
      <ul>
        <li v-for="opcao in sugestoes" :key="opcao.id">
          <button type="button" @click="escolher(opcao)">{{ opcao.nome_canonico }}</button>
        </li>
        <li v-if="podeCriar">
          <button type="button" @click="criar">Criar “{{ termo.trim() }}”</button>
        </li>
      </ul>
    </template>
  </span>
</template>
