<script setup>
// Print do depoimento: colar (Ctrl+V), arrastar ou escolher. Só comprime e
// entrega o arquivo (emit 'arquivo'); enviar ao bucket é com a Ficha, depois
// de validar. `atual` é o print_path já salvo, mostrado por URL assinada
// (o bucket prints é privado).
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { comprimir } from '../lib/imagem.js'
import { mensagemDeErro } from '../lib/erros.js'
import { urlAssinadaDoPrint } from '../dados/depoimentos.js'

const props = defineProps({
  atual: { type: String, default: '' },
})
const emit = defineEmits(['arquivo'])

const previa = ref(null)
const tamanhos = ref(null)
const erro = ref('')
const urlAtual = ref(null)

watch(() => props.atual, async (caminho) => {
  urlAtual.value = null
  if (!caminho) return
  try {
    urlAtual.value = await urlAssinadaDoPrint(caminho)
    erro.value = ''
  } catch (e) {
    erro.value = mensagemDeErro(e)
  }
}, { immediate: true })

function trocarPrevia(url) {
  if (previa.value) URL.revokeObjectURL(previa.value)
  previa.value = url
}

// Descarta o print novo pendente (ainda nao enviado ao bucket — Ficha so
// envia ao salvar) e volta a mostrar a previa do print ja salvo, se houver.
// Nao mexe em `atual`/`urlAtual`: quem decide remover o print salvo e outra
// decisao de produto, fora do escopo daqui.
function descartar() {
  trocarPrevia(null)
  tamanhos.value = null
  erro.value = ''
  emit('arquivo', null)
}

// comprimir() recusa navegador sem WebP (Safari) e imagem que não decodifica:
// vira mensagem na tela, não exceção solta no console.
async function receber(arquivo) {
  if (!arquivo?.type?.startsWith('image/')) return
  erro.value = ''
  try {
    const comprimido = await comprimir(arquivo)
    tamanhos.value = {
      antes: Math.round(arquivo.size / 1024),
      depois: Math.round(comprimido.size / 1024),
    }
    trocarPrevia(URL.createObjectURL(comprimido))
    emit('arquivo', comprimido)
  } catch (e) {
    erro.value = mensagemDeErro(e)
  }
}

// Zera o input depois de ler: escolher o MESMO arquivo de novo (ex.: depois
// de um erro) tem de disparar change outra vez.
function aoEscolher(evento) {
  receber(evento.target.files[0])
  evento.target.value = ''
}

function aoColar(evento) {
  const item = [...(evento.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
  if (item) receber(item.getAsFile())
}

onMounted(() => window.addEventListener('paste', aoColar))
onUnmounted(() => {
  window.removeEventListener('paste', aoColar)
  trocarPrevia(null)
})
</script>

<template>
  <div class="campo-print" @drop.prevent="receber($event.dataTransfer.files[0])" @dragover.prevent>
    <p>Print: arraste, escolha um arquivo ou <strong>cole com Ctrl+V</strong>.</p>
    <input type="file" accept="image/*" @change="aoEscolher" />
    <template v-if="previa">
      <img :src="previa" alt="Prévia do print novo" />
      <small v-if="tamanhos">{{ tamanhos.antes }} KB → {{ tamanhos.depois }} KB</small>
      <small v-if="atual"> — substitui o print atual ao salvar.</small>
      <button type="button" @click="descartar">Descartar</button>
    </template>
    <img v-else-if="urlAtual" :src="urlAtual" alt="Print salvo" />
    <p v-if="erro" role="alert">{{ erro }}</p>
  </div>
</template>
