<script setup>
import { ref } from 'vue'
import { entrarComGoogle } from '../dados/sessao.js'

const erro = ref('')
const entrando = ref(false)

async function aoClicarEntrar() {
  erro.value = ''
  entrando.value = true
  try {
    await entrarComGoogle()
  } catch (e) {
    erro.value = e?.message ?? String(e)
  } finally {
    entrando.value = false
  }
}
</script>

<template>
  <section>
    <h1>UN Provas Sociais</h1>
    <p>Acesso restrito à equipe.</p>
    <button :disabled="entrando" @click="aoClicarEntrar">Entrar com Google</button>
    <p v-if="erro" role="alert">Não foi possível entrar com o Google: {{ erro }}</p>
  </section>
</template>
