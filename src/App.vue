<script setup>
import { ref, computed, onMounted } from 'vue'
import { usuarioAtual, aoMudarSessao, sair, retomarRetornoDoLogin } from './dados/sessao.js'
import { interpretarRota } from './lib/rotas.js'
import Login from './telas/Login.vue'
import Cadastros from './telas/Cadastros.vue'
import Ficha from './telas/Ficha.vue'
import Lista from './telas/Lista.vue'

const usuario = ref(null)
const carregando = ref(true)
const rota = ref(interpretarRota(location.hash))

// "Novo depoimento" clicado ja na ficha nova: o hash nao muda (nao ha
// hashchange) e rota.id continua null, entao a key antiga ('nova') nao
// remontaria a ficha. O contador entra na key da ficha nova e forca a
// remontagem (Task 21, terceira emenda).
const novas = ref(0)
const chaveFicha = computed(() => rota.value.id ?? `nova-${novas.value}`)

function novoDepoimento() {
  if (rota.value.tela === 'ficha' && rota.value.id == null) novas.value++
}

onMounted(async () => {
  usuario.value = await usuarioAtual()
  // Voltando do login: o link que a pessoa abriu deslogada (hash guardado
  // antes do OAuth) vale de novo, uma vez so.
  const retorno = usuario.value ? retomarRetornoDoLogin() : null
  if (retorno && retorno !== location.hash) {
    location.hash = retorno
    rota.value = interpretarRota(retorno)
  }
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
        <a href="#/depoimentos">Depoimentos</a>
        <a href="#/ficha" @click="novoDepoimento">Novo depoimento</a>
        <a href="#/cadastros">Cadastros</a>
      </nav>
      <span>{{ usuario.email }}</span>
      <button @click="sair">Sair</button>
    </header>
    <!-- :key remonta a ficha ao trocar de depoimento (ou de nova para salva). -->
    <Ficha v-if="rota.tela === 'ficha'" :key="chaveFicha" :id="rota.id" />
    <Cadastros v-else-if="rota.tela === 'cadastros'" />
    <Lista v-else-if="rota.tela === 'depoimentos'" :consulta="rota.consulta" />
  </main>
</template>
