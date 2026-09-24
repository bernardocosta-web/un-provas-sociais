<script setup>
import { ref, onMounted } from 'vue'
import { usuarioAtual, aoMudarSessao, sair } from './dados/sessao.js'
import Login from './telas/Login.vue'

const usuario = ref(null)
const carregando = ref(true)

onMounted(async () => {
  usuario.value = await usuarioAtual()
  carregando.value = false
  aoMudarSessao((sessao) => { usuario.value = sessao?.user ?? null })
})
</script>

<template>
  <p v-if="carregando">Carregando…</p>
  <Login v-else-if="!usuario" />
  <main v-else>
    <header>
      <span>{{ usuario.email }}</span>
      <button @click="sair">Sair</button>
    </header>
    <p>Autenticado.</p>
  </main>
</template>
