<script setup>
// Uma linha da lista: as colunas da aba (colunasDaAba), com as logos das
// instituicoes aprovadas vindas do bucket publico (URL publica, sem
// assinatura). Clicar na linha abre a ficha.
import { urlDaLogo } from '../dados/referencia.js'
import { rotaDaFicha } from '../lib/rotas.js'

const props = defineProps({
  linha: { type: Object, required: true },
  colunas: { type: Array, required: true },
})

function abrir() {
  location.hash = rotaDaFicha(props.linha.id)
}
</script>

<template>
  <tr class="linha" @click="abrir">
    <td><a :href="rotaDaFicha(linha.id)" @click.stop>#{{ linha.id }}</a></td>
    <td v-for="c in colunas" :key="c.chave" :class="{ destaque: c.destaque }" :data-coluna="c.chave">
      <template v-if="c.chave === 'tipos'">{{ linha.tipos.join(', ') }}</template>
      <template v-else-if="c.chave === 'logos'">
        <span v-for="i in linha.instituicoes" :key="i.id" class="instituicao">
          <img v-if="i.logo_path" :src="urlDaLogo(i.logo_path)" :alt="i.nome" :title="i.nome" />
          <template v-else>{{ i.nome }}</template>
        </span>
      </template>
      <template v-else-if="c.chave === 'link'">
        <!-- href so para http(s) (linhaDaLista); outro esquema aparece como texto. -->
        <a v-if="linha.href" :href="linha.href" target="_blank" rel="noopener noreferrer"
           @click.stop>abrir</a>
        <template v-else>{{ linha.link }}</template>
      </template>
      <strong v-else-if="c.chave === 'autorizacao'">{{ linha.autorizacao }}</strong>
      <template v-else>{{ linha[c.chave] }}</template>
    </td>
  </tr>
</template>

<style scoped>
.linha { cursor: pointer; }
.linha:hover { background: #f3f4f6; }
.destaque { background: #fefce8; }
.instituicao { margin-right: 0.25rem; }
.instituicao img { height: 24px; vertical-align: middle; }
</style>
