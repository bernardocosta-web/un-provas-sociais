<script setup>
import { ref, onMounted } from 'vue'
import { mensagemDeErro } from '../lib/erros.js'
import { listarInstituicoes } from '../dados/referencia.js'
import ListaInstituicoes from '../componentes/ListaInstituicoes.vue'
import FormInstituicao from '../componentes/FormInstituicao.vue'
import ListaProvas from '../componentes/ListaProvas.vue'
import ListaSimples from '../componentes/ListaSimples.vue'

const ABAS = [
  { chave: 'instituicoes', rotulo: 'Instituições' },
  { chave: 'provas', rotulo: 'Provas' },
  { chave: 'cursos', rotulo: 'Cursos' },
  { chave: 'materias', rotulo: 'Matérias' },
]

const abaAtiva = ref('instituicoes')

const instituicoes = ref([])
const carregandoInstituicoes = ref(true)
const erroInstituicoes = ref('')
const instituicaoEditando = ref(null)
const mostrarFormInstituicao = ref(false)

async function carregarInstituicoes() {
  carregandoInstituicoes.value = true
  erroInstituicoes.value = ''
  try {
    instituicoes.value = await listarInstituicoes()
  } catch (e) {
    erroInstituicoes.value = mensagemDeErro(e)
  } finally {
    carregandoInstituicoes.value = false
  }
}

function novaInstituicao() {
  instituicaoEditando.value = null
  mostrarFormInstituicao.value = true
}

function editarInstituicao(instituicao) {
  instituicaoEditando.value = instituicao
  mostrarFormInstituicao.value = true
}

async function aoSalvarInstituicao() {
  mostrarFormInstituicao.value = false
  await carregarInstituicoes()
}

// Mesclar apaga a instituicao perdedora (0012, mesclar_instituicoes). Se o
// formulario estiver aberto sobre a vencedora ou a perdedora, os campos
// continuam mostrando dados que nao valem mais (a perdedora nem existe
// mais). Mais simples e seguro fechar sempre — ListaInstituicoes nao manda
// os ids da mesclagem, e nao ha por que guardar esse estado so para decidir
// entre "fechar as duas" e "fechar sempre".
async function aoMesclarInstituicao() {
  mostrarFormInstituicao.value = false
  instituicaoEditando.value = null
  await carregarInstituicoes()
}

onMounted(carregarInstituicoes)
</script>

<template>
  <section>
    <nav>
      <button
        v-for="aba in ABAS"
        :key="aba.chave"
        type="button"
        :disabled="abaAtiva === aba.chave"
        @click="abaAtiva = aba.chave"
      >
        {{ aba.rotulo }}
      </button>
    </nav>

    <div v-if="abaAtiva === 'instituicoes'">
      <h2>Instituições</h2>
      <p v-if="erroInstituicoes" role="alert">{{ erroInstituicoes }}</p>
      <button type="button" @click="novaInstituicao">Nova instituição</button>

      <FormInstituicao
        v-if="mostrarFormInstituicao"
        :key="instituicaoEditando?.id ?? 'nova'"
        :instituicao="instituicaoEditando"
        @salvo="aoSalvarInstituicao"
        @cancelar="mostrarFormInstituicao = false"
      />

      <p v-if="carregandoInstituicoes">Carregando…</p>
      <ListaInstituicoes
        v-else
        :instituicoes="instituicoes"
        @editar="editarInstituicao"
        @mesclado="aoMesclarInstituicao"
      />
    </div>

    <ListaProvas v-else-if="abaAtiva === 'provas'" />
    <ListaSimples v-else-if="abaAtiva === 'cursos'" tabela="curso" titulo="Cursos" />
    <ListaSimples v-else-if="abaAtiva === 'materias'" tabela="materia" titulo="Matérias" />
  </section>
</template>
