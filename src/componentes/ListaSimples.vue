<script setup>
// Reaproveitado pelas abas de Provas, Cursos e Matérias em Cadastros.vue: as
// três só têm nome, sem lógica própria (listarSimples/criarSimples cobrem
// as duas). Evita repetir o mesmo formulário três vezes.
import { ref, onMounted } from 'vue'
import { listarSimples, criarSimples } from '../dados/referencia.js'

const props = defineProps({
  tabela: { type: String, required: true },
  titulo: { type: String, required: true },
})

const itens = ref([])
const nomeNovo = ref('')
const carregando = ref(true)
const criando = ref(false)
const erro = ref('')

async function carregar() {
  carregando.value = true
  erro.value = ''
  try {
    itens.value = await listarSimples(props.tabela)
  } catch (e) {
    erro.value = e.message
  } finally {
    carregando.value = false
  }
}

async function criar() {
  const nome = nomeNovo.value.trim()
  if (!nome) return
  criando.value = true
  erro.value = ''
  try {
    await criarSimples(props.tabela, nome)
    nomeNovo.value = ''
    await carregar()
  } catch (e) {
    erro.value = e.message
  } finally {
    criando.value = false
  }
}

onMounted(carregar)
</script>

<template>
  <section>
    <h2>{{ titulo }}</h2>
    <p v-if="carregando">Carregando…</p>
    <ul v-else>
      <li v-for="item in itens" :key="item.id">{{ item.nome }}</li>
    </ul>

    <form @submit.prevent="criar">
      <label>
        Novo nome
        <input v-model="nomeNovo" required />
      </label>
      <button type="submit" :disabled="criando">Adicionar</button>
    </form>

    <p v-if="erro" role="alert">{{ erro }}</p>
  </section>
</template>
