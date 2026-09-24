<script setup>
// Reaproveitado pelas abas de Cursos e Matérias em Cadastros.vue: as duas só
// têm nome, sem lógica própria (listarSimples/criarSimples cobrem as duas).
// Provas tem instituição opcional e usa ListaProvas.vue, não este.
import { ref, onMounted } from 'vue'
import { mensagemDeErro } from '../lib/erros.js'
import { listarSimples, criarSimples, removerCadastro } from '../dados/referencia.js'

const props = defineProps({
  tabela: { type: String, required: true },
  titulo: { type: String, required: true },
})

const itens = ref([])
const nomeNovo = ref('')
const carregando = ref(true)
const criando = ref(false)
const erro = ref('')
const removendoId = ref(null)

async function carregar() {
  carregando.value = true
  erro.value = ''
  try {
    itens.value = await listarSimples(props.tabela)
  } catch (e) {
    erro.value = mensagemDeErro(e)
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
    erro.value = mensagemDeErro(e)
  } finally {
    criando.value = false
  }
}

// Sem uso, some direto; em uso (resultado/nota, conforme a tabela) o banco
// recusa (P0001, pt-BR, com a contagem) e a mensagem passa como está
// (mensagemDeErro).
async function remover(item) {
  if (!confirm(`Remover "${item.nome}"? Isso não pode ser desfeito.`)) return
  erro.value = ''
  removendoId.value = item.id
  try {
    await removerCadastro(props.tabela, item.id)
    await carregar()
  } catch (e) {
    erro.value = mensagemDeErro(e)
  } finally {
    removendoId.value = null
  }
}

onMounted(carregar)
</script>

<template>
  <section>
    <h2>{{ titulo }}</h2>
    <p v-if="carregando">Carregando…</p>
    <ul v-else>
      <li v-for="item in itens" :key="item.id">
        {{ item.nome }}
        <button type="button" :disabled="removendoId === item.id" @click="remover(item)">Remover</button>
      </li>
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
