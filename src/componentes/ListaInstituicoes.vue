<script setup>
import { ref, computed } from 'vue'
import { mensagemDeErro } from '../lib/erros.js'
import { urlDaLogo, mesclarInstituicoes } from '../dados/referencia.js'

const props = defineProps({
  instituicoes: { type: Array, required: true },
})
const emit = defineEmits(['editar', 'mesclado'])

// Fluxo de mesclagem: escolhe a perdedora na tabela, depois a vencedora numa
// lista à parte (nunca a mesma linha). A remoção da logo da perdedora no
// bucket já acontece dentro de mesclarInstituicoes.
const perdedora = ref(null)
const vencedoraId = ref('')
const erro = ref('')
const mesclando = ref(false)

const candidatasVencedora = computed(() =>
  props.instituicoes.filter((i) => i.id !== perdedora.value?.id))

function iniciarMesclagem(instituicao) {
  perdedora.value = instituicao
  vencedoraId.value = ''
  erro.value = ''
}

function cancelarMesclagem() {
  perdedora.value = null
}

async function confirmarMesclagem() {
  erro.value = ''
  mesclando.value = true
  try {
    await mesclarInstituicoes(Number(vencedoraId.value), perdedora.value.id)
    perdedora.value = null
    emit('mesclado')
  } catch (e) {
    erro.value = mensagemDeErro(e)
  } finally {
    mesclando.value = false
  }
}
</script>

<template>
  <table>
    <thead>
      <tr>
        <th>Logo</th>
        <th>Nome</th>
        <th>Apelidos</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="i in instituicoes" :key="i.id">
        <td><img v-if="i.logo_path" :src="urlDaLogo(i.logo_path)" alt="" width="40" /></td>
        <td>{{ i.nome_canonico }}</td>
        <td>{{ i.apelidos.join(', ') }}</td>
        <td>
          <button type="button" @click="emit('editar', i)">Editar</button>
          <button type="button" @click="iniciarMesclagem(i)">Mesclar</button>
        </td>
      </tr>
    </tbody>
  </table>

  <div v-if="perdedora" role="group" aria-label="Mesclar instituição">
    <p>Mesclar "{{ perdedora.nome_canonico }}" em:</p>
    <select v-model="vencedoraId">
      <option value="" disabled>Escolha a vencedora</option>
      <option v-for="c in candidatasVencedora" :key="c.id" :value="c.id">{{ c.nome_canonico }}</option>
    </select>
    <button type="button" :disabled="!vencedoraId || mesclando" @click="confirmarMesclagem">
      Confirmar mesclagem
    </button>
    <button type="button" @click="cancelarMesclagem">Cancelar</button>
    <p v-if="erro" role="alert">{{ erro }}</p>
  </div>
</template>
