<script setup>
// Aba de Provas: diferente de Cursos/Matérias (ListaSimples), tem uma
// instituição opcional (nula para o ENEM) — por isso um componente próprio,
// em vez de forçar o genérico a conhecer instituição.
import { ref, onMounted } from 'vue'
import { mensagemDeErro } from '../lib/erros.js'
import { listarProvas, criarProva, listarInstituicoes, removerCadastro } from '../dados/referencia.js'

const provas = ref([])
const instituicoesAtivas = ref([])
const nomeNovo = ref('')
const instituicaoId = ref('')
const carregando = ref(true)
const criando = ref(false)
const erro = ref('')
const removendoId = ref(null)

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

// Sem uso, some direto; em uso (participacao) o banco recusa (P0001, pt-BR,
// com a contagem) e a mensagem passa como está (mensagemDeErro).
async function remover(prova) {
  if (!confirm(`Remover "${prova.nome}"? Isso não pode ser desfeito.`)) return
  erro.value = ''
  removendoId.value = prova.id
  try {
    await removerCadastro('prova', prova.id)
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
    <h2>Provas</h2>
    <p v-if="carregando">Carregando…</p>
    <ul v-else>
      <li v-for="prova in provas" :key="prova.id">
        {{ prova.nome }}
        <span v-if="prova.instituicao_nome">— {{ prova.instituicao_nome }}</span>
        <button type="button" :disabled="removendoId === prova.id" @click="remover(prova)">Remover</button>
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
