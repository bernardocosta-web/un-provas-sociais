<script setup>
// Aba de Provas: diferente de Cursos/Matérias (ListaSimples), tem uma
// instituição opcional (nula para o ENEM) — por isso um componente próprio,
// em vez de forçar o genérico a conhecer instituição.
import { ref, onMounted } from 'vue'
import { mensagemDeErro } from '../lib/erros.js'
import { listarProvas, criarProva, listarInstituicoes } from '../dados/referencia.js'

const provas = ref([])
const instituicoesAtivas = ref([])
const nomeNovo = ref('')
const instituicaoId = ref('')
const carregando = ref(true)
const criando = ref(false)
const erro = ref('')

async function carregar() {
  carregando.value = true
  erro.value = ''
  try {
    const [listaProvas, listaInstituicoes] = await Promise.all([
      listarProvas(),
      listarInstituicoes(),
    ])
    provas.value = listaProvas
    instituicoesAtivas.value = listaInstituicoes.filter((i) => i.ativo)
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
    await criarProva({ nome, instituicao_id: instituicaoId.value || null })
    nomeNovo.value = ''
    instituicaoId.value = ''
    await carregar()
  } catch (e) {
    erro.value = mensagemDeErro(e)
  } finally {
    criando.value = false
  }
}

onMounted(carregar)
</script>

<template>
  <section>
    <h2>Provas</h2>
    <p v-if="carregando">Carregando…</p>
    <ul v-else>
      <li v-for="prova in provas" :key="prova.id">
        {{ prova.nome }}
        <span v-if="prova.instituicao_nome">— {{ prova.instituicao_nome }}</span>
      </li>
    </ul>

    <form @submit.prevent="criar">
      <label>
        Novo nome
        <input v-model="nomeNovo" required />
      </label>
      <label>
        Instituição
        <select v-model="instituicaoId">
          <option value="">Nenhuma</option>
          <option v-for="i in instituicoesAtivas" :key="i.id" :value="i.id">{{ i.nome_canonico }}</option>
        </select>
      </label>
      <button type="submit" :disabled="criando">Adicionar</button>
    </form>

    <p v-if="erro" role="alert">{{ erro }}</p>
  </section>
</template>
