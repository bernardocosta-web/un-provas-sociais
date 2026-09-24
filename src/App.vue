<script setup>
import { ref, onMounted } from 'vue'
import { usuarioAtual, aoMudarSessao, sair } from './dados/sessao.js'
import { interpretarRota } from './lib/rotas.js'
import Login from './telas/Login.vue'
import Cadastros from './telas/Cadastros.vue'
import Ficha from './telas/Ficha.vue'

const usuario = ref(null)
const carregando = ref(true)
const rota = ref(interpretarRota(location.hash))

onMounted(async () => {
  usuario.value = await usuarioAtual()
  carregando.value = false
  // Sem onUnmounted cancelando a assinatura nem o listener: App.vue é a raiz
  // e nunca desmonta.
  aoMudarSessao((sessao) => { usuario.value = sessao?.user ?? null })
  window.addEventListener('hashchange', () => { rota.value = interpretarRota(location.hash) })
})
</script>

<template>
  <p v-if="carregando">Carregando…</p>
  <Login v-else-if="!usuario" />
  <main v-else>
    <header>
      <nav>
        <a href="#/">Cadastros</a>
        <a href="#/ficha">Novo depoimento</a>
      </nav>
      <span>{{ usuario.email }}</span>
      <button @click="sair">Sair</button>
    </header>
    <!-- :key remonta a ficha ao trocar de depoimento (ou de nova para salva). -->
    <Ficha v-if="rota.tela === 'ficha'" :key="rota.id ?? 'nova'" :id="rota.id" />
    <Cadastros v-else />
  </main>
</template>
