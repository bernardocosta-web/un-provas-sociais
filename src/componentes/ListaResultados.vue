<script setup>
// Resultados de uma participação: instituição e curso por combobox (com
// criar na hora, que é de ListaParticipacoes: ela guarda as listas).
import { computed } from 'vue'
import { novoResultado } from '../lib/formulario.js'
import { comoOpcao } from '../lib/instituicoes.js'
import { SITUACOES } from '../lib/rotulos.js'
import CaixaBusca from './CaixaBusca.vue'

const props = defineProps({
  resultados: { type: Array, required: true },
  instituicoes: { type: Array, required: true },
  cursos: { type: Array, required: true },
  // async (tipo, termo) => id criado, ou null se falhou (o erro aparece lá).
  criarNaHora: { type: Function, required: true },
})

// Instituição já tem nome_canonico/apelidos; inativa não é oferecida.
const opcoesInstituicao = computed(() => props.instituicoes.filter((i) => i.ativo))
const opcoesCurso = computed(() => props.cursos.map(comoOpcao))

async function criar(resultado, campo, tipo, termo) {
  const id = await props.criarNaHora(tipo, termo)
  if (id != null) resultado[campo] = id
}

function adicionar() {
  props.resultados.push(novoResultado())
}

function remover(indice) {
  props.resultados.splice(indice, 1)
}
</script>

<template>
  <fieldset>
    <legend>Resultados</legend>
    <div v-for="(resultado, indice) in resultados" :key="resultado._chave">
      <CaixaBusca
        v-model="resultado.instituicao_id"
        rotulo="Instituição"
        :opcoes="opcoesInstituicao"
        :conhecidas="instituicoes"
        @criar="(termo) => criar(resultado, 'instituicao_id', 'instituicao', termo)"
      />
      <CaixaBusca
        v-model="resultado.curso_id"
        rotulo="Curso"
        :opcoes="opcoesCurso"
        @criar="(termo) => criar(resultado, 'curso_id', 'curso', termo)"
      />
      <label>
        Situação
        <select v-model="resultado.situacao">
          <option value="">—</option>
          <option v-for="s in SITUACOES" :key="s.valor" :value="s.valor">{{ s.rotulo }}</option>
        </select>
      </label>
      <button type="button" @click="remover(indice)">Remover resultado</button>
    </div>
    <button type="button" @click="adicionar">+ Resultado</button>
  </fieldset>
</template>
