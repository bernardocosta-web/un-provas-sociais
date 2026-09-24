<script setup>
// Ficha do depoimento (#/ficha nova, #/ficha/:id edição). Monta os
// componentes e salva. App.vue remonta esta tela quando o id muda (:key).
import { reactive, ref, onMounted } from 'vue'
import {
  carregarDepoimento, salvarDepoimento, enviarPrint, removerPrint,
} from '../dados/depoimentos.js'
import { gravarFicha } from '../lib/gravacao.js'
import { mensagemDeErro } from '../lib/erros.js'
import { novaFicha, comChaves, podeEditar } from '../lib/formulario.js'
import { rotaDaFicha } from '../lib/rotas.js'
import CamposDepoimento from '../componentes/CamposDepoimento.vue'
import SeletorAluno from '../componentes/SeletorAluno.vue'
import CampoPrint from '../componentes/CampoPrint.vue'
import ListaParticipacoes from '../componentes/ListaParticipacoes.vue'

const props = defineProps({
  id: { type: Number, default: null },
})

const ficha = reactive(novaFicha())
const printNovo = ref(null)
const erros = ref([])
const carregando = ref(false)
const salvando = ref(false)
const salvo = ref(false)
const falhouCarga = ref(false)

async function carregar() {
  carregando.value = true
  falhouCarga.value = false
  erros.value = []
  try {
    Object.assign(ficha, comChaves(await carregarDepoimento(props.id)))
  } catch (e) {
    falhouCarga.value = true
    erros.value = [mensagemDeErro(e)]
  } finally {
    carregando.value = false
  }
}

onMounted(() => {
  if (props.id != null) carregar()
})

// A ordem (validar -> enviar print novo -> salvar -> remover o antigo; se
// salvar falhar, remover o novo) vive em gravarFicha (src/lib/gravacao.js),
// testada sem rede. Aqui só se ligam as operações reais.
const OPERACOES = {
  enviar: enviarPrint,
  salvar: salvarDepoimento,
  remover: removerPrint,
  nomeUnico: () => `${crypto.randomUUID()}.webp`,
}

async function salvar() {
  salvo.value = false
  salvando.value = true
  let resultado
  try {
    resultado = await gravarFicha(ficha, printNovo.value, OPERACOES)
  } catch (e) {
    erros.value = [mensagemDeErro(e)]
    return
  } finally {
    salvando.value = false
  }
  erros.value = resultado.erros
  if (erros.value.length) return
  ficha.print_path = resultado.print_path
  printNovo.value = null
  if (Number(resultado.id) !== props.id) {
    // Antes de trocar a rota: se o hashchange demorar, um segundo Salvar
    // atualiza este depoimento em vez de criar outro.
    ficha.id = resultado.id
    location.hash = rotaDaFicha(resultado.id)
    return
  }
  // Mesma ficha: recarrega do banco para mostrar o que ficou gravado.
  await carregar()
  salvo.value = erros.value.length === 0
}
</script>

<template>
  <section>
    <h2>{{ id == null ? 'Novo depoimento' : `Depoimento #${id}` }}</h2>
    <p v-if="carregando">Carregando…</p>
    <!-- Carregamento falhou: sem formulario, senao Salvar criaria um depoimento novo. -->
    <div v-else-if="!podeEditar(id, falhouCarga)" role="alert">
      <p v-for="erro in erros" :key="erro">{{ erro }}</p>
      <button type="button" @click="carregar">Tentar de novo</button>
      <a href="#/">Voltar</a>
    </div>
    <form v-else @submit.prevent="salvar">
      <CamposDepoimento :model-value="ficha" />
      <SeletorAluno :ficha="ficha" />
      <CampoPrint :atual="ficha.print_path ?? ''" @arquivo="printNovo = $event" />
      <ListaParticipacoes :participacoes="ficha.participacoes" />

      <ul v-if="erros.length" role="alert">
        <li v-for="erro in erros" :key="erro">{{ erro }}</li>
      </ul>
      <p v-if="salvo" role="status">Salvo.</p>
      <button type="submit" :disabled="salvando">{{ salvando ? 'Salvando…' : 'Salvar' }}</button>
    </form>
  </section>
</template>
