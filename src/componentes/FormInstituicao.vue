<script setup>
import { ref, reactive, computed } from 'vue'
import { comprimir } from '../lib/imagem.js'
import { mensagemDeErro } from '../lib/erros.js'
import { salvarInstituicao, enviarLogo, removerLogo, urlDaLogo } from '../dados/referencia.js'

const props = defineProps({
  instituicao: { type: Object, default: null },
})
const emit = defineEmits(['salvo', 'cancelar'])

const form = reactive({
  id: props.instituicao?.id ?? null,
  nome_canonico: props.instituicao?.nome_canonico ?? '',
  logo_path: props.instituicao?.logo_path ?? null,
})
const urlLogoAtual = computed(() => urlDaLogo(form.logo_path))
const apelidos = ref([...(props.instituicao?.apelidos ?? [])])
const novoApelido = ref('')
const arquivoEscolhido = ref(null)
const erro = ref('')
const salvando = ref(false)

function aoEscolherArquivo(evento) {
  arquivoEscolhido.value = evento.target.files?.[0] ?? null
}

function adicionarApelido() {
  const valor = novoApelido.value.trim()
  if (valor && !apelidos.value.includes(valor)) apelidos.value.push(valor)
  novoApelido.value = ''
}

function removerApelido(indice) {
  apelidos.value.splice(indice, 1)
}

// Ordem que importa: envia o arquivo novo (nome unico) antes de gravar a
// instituicao, e so apaga o antigo depois de o salvamento confirmar. Se o
// salvamento falhar, apaga o novo (nao o antigo) — a logo que ja funcionava
// continua valendo.
async function salvar() {
  erro.value = ''
  salvando.value = true
  const antigo = form.logo_path
  let novo = null
  try {
    if (arquivoEscolhido.value) {
      const comprimido = await comprimir(arquivoEscolhido.value)
      novo = await enviarLogo(comprimido, `${crypto.randomUUID()}.webp`)
    }
    await salvarInstituicao({ ...form, logo_path: novo ?? antigo, apelidos: apelidos.value })
  } catch (e) {
    if (novo) await removerLogo(novo).catch(() => {})
    erro.value = mensagemDeErro(e)
    salvando.value = false
    return
  }
  if (novo && antigo) await removerLogo(antigo).catch(() => {})
  salvando.value = false
  emit('salvo')
}
</script>

<template>
  <form @submit.prevent="salvar">
    <label>
      Nome canônico
      <input v-model="form.nome_canonico" required />
    </label>

    <div>
      <img v-if="urlLogoAtual" :src="urlLogoAtual" alt="Logo atual" width="80" />
      <label>
        Logo (WebP)
        <input type="file" accept="image/*" @change="aoEscolherArquivo" />
      </label>
    </div>

    <fieldset>
      <legend>Apelidos</legend>
      <ul>
        <li v-for="(apelido, indice) in apelidos" :key="apelido">
          {{ apelido }}
          <button type="button" @click="removerApelido(indice)">Remover</button>
        </li>
      </ul>
      <label>
        Novo apelido
        <input v-model="novoApelido" @keydown.enter.prevent="adicionarApelido" />
      </label>
      <button type="button" @click="adicionarApelido">Adicionar apelido</button>
    </fieldset>

    <p v-if="erro" role="alert">{{ erro }}</p>

    <button type="submit" :disabled="salvando">Salvar</button>
    <button type="button" @click="emit('cancelar')">Cancelar</button>
  </form>
</template>
