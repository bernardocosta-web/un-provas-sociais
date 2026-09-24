<script setup>
// Autor (como veio da fonte) e o aluno ligado ao depoimento. A sugestão
// NUNCA liga sozinha: mostra "parece ser Fulano — ligar?" e espera o clique,
// porque nomes se repetem.
import { ref, reactive, computed, onMounted } from 'vue'
import { listarAlunos, criarAluno } from '../dados/alunos.js'
import { sugerirAlunos, buscarAlunos } from '../lib/alunos.js'
import { mensagemDeErro } from '../lib/erros.js'
import { PLATAFORMAS } from '../lib/rotulos.js'

const props = defineProps({
  ficha: { type: Object, required: true },
})

const alunos = ref([])
const erro = ref('')
const termo = ref('')
const criando = ref(false)
const novo = reactive({ aberto: false, nome: '', plataforma: 'GOOGLE', identificador: '' })

onMounted(async () => {
  try {
    alunos.value = await listarAlunos()
  } catch (e) {
    erro.value = mensagemDeErro(e)
  }
})

const ligado = computed(() => alunos.value.find((a) => a.id === props.ficha.aluno_id))
const sugestoes = computed(() =>
  sugerirAlunos(props.ficha.autor_bruto, props.ficha.autor_contato_bruto, alunos.value))
const encontrados = computed(() => buscarAlunos(alunos.value, termo.value))

function ligar(aluno) {
  props.ficha.aluno_id = aluno.id
  termo.value = ''
}

function abrirNovo() {
  Object.assign(novo, {
    aberto: true,
    nome: props.ficha.autor_bruto ?? '',
    identificador: props.ficha.autor_contato_bruto || props.ficha.autor_bruto || '',
  })
}

async function criarELigar() {
  if (!novo.nome.trim()) return
  criando.value = true
  erro.value = ''
  try {
    const aluno = await criarAluno(novo.nome, [
      { plataforma: novo.plataforma, identificador: novo.identificador },
    ])
    alunos.value.push(aluno)
    ligar(aluno)
    novo.aberto = false
  } catch (e) {
    erro.value = mensagemDeErro(e)
  } finally {
    criando.value = false
  }
}
</script>

<template>
  <fieldset>
    <legend>Autor e aluno</legend>
    <label>
      Autor (como veio da fonte)
      <input v-model="ficha.autor_bruto" />
    </label>
    <label>
      Contato do autor
      <input v-model="ficha.autor_contato_bruto" placeholder="@perfil, e-mail…" />
    </label>

    <p v-if="ficha.aluno_id">
      Aluno: <strong>{{ ligado?.nome_exibicao ?? `#${ficha.aluno_id}` }}</strong>
      <button type="button" @click="ficha.aluno_id = ''">Desligar</button>
    </p>
    <template v-else>
      <p v-for="aluno in sugestoes" :key="aluno.id">
        Parece ser <strong>{{ aluno.nome_exibicao }}</strong> — ligar?
        <button type="button" @click="ligar(aluno)">Ligar</button>
      </p>
      <label>
        Buscar aluno
        <input v-model="termo" placeholder="Nome ou perfil" />
      </label>
      <ul v-if="encontrados.length">
        <li v-for="aluno in encontrados" :key="aluno.id">
          {{ aluno.nome_exibicao }}
          <small>{{ aluno.perfis.map((p) => p.identificador).join(', ') }}</small>
          <button type="button" @click="ligar(aluno)">Ligar</button>
        </li>
      </ul>
      <button v-if="!novo.aberto" type="button" @click="abrirNovo">Novo aluno</button>
      <div v-else>
        <label>Nome <input v-model="novo.nome" /></label>
        <label>
          Perfil
          <select v-model="novo.plataforma">
            <option v-for="p in PLATAFORMAS" :key="p.valor" :value="p.valor">{{ p.rotulo }}</option>
          </select>
        </label>
        <label>Identificador <input v-model="novo.identificador" /></label>
        <button type="button" :disabled="criando" @click="criarELigar">Criar e ligar</button>
        <button type="button" @click="novo.aberto = false">Cancelar</button>
      </div>
    </template>
    <p v-if="erro" role="alert">{{ erro }}</p>
  </fieldset>
</template>
