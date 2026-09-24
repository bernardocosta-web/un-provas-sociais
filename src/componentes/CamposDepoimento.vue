<script setup>
// Cabeçalho da ficha: texto, resumo (com aviso de tamanho que nunca
// bloqueia), fonte, link, data, autorização, tipos, canais, status e
// descarte. Autorização e status mudam outros campos na mesma operação
// (mudarAutorizacao/mudarStatus, src/lib/formulario.js), senão o banco recusa.
import { computed } from 'vue'
import { LIMITE_AVISO_RESUMO } from '../lib/validacao.js'
import { mudarAutorizacao, mudarStatus } from '../lib/formulario.js'
import { TIPOS, CANAIS, FONTES, AUTORIZACOES, STATUS, MOTIVOS } from '../lib/rotulos.js'

const props = defineProps({ modelValue: { type: Object, required: true } })

const tamanho = computed(() => (props.modelValue.resumo_curto ?? '').length)
const longo = computed(() => tamanho.value > LIMITE_AVISO_RESUMO)
const descartado = computed(() => props.modelValue.status_uso === 'DESCARTADO')
</script>

<template>
  <fieldset>
    <legend>Depoimento</legend>
    <label>
      Texto completo *
      <textarea v-model="modelValue.texto_completo" rows="6" />
    </label>
    <label>
      Resumo curto
      <textarea v-model="modelValue.resumo_curto" rows="3" />
      <small :class="{ aviso: longo }">
        {{ tamanho }} caracteres
        <template v-if="longo">
          — acima de {{ LIMITE_AVISO_RESUMO }} costuma ficar ilegível na página 1
          do carrossel. Você pode salvar assim mesmo.
        </template>
      </small>
    </label>

    <label>
      Fonte *
      <select v-model="modelValue.fonte">
        <option value="">—</option>
        <option v-for="f in FONTES" :key="f.valor" :value="f.valor">{{ f.rotulo }}</option>
      </select>
    </label>
    <label>Link original <input v-model="modelValue.link_original" type="url" /></label>
    <label>Data <input v-model="modelValue.data_depoimento" type="date" /></label>
    <label>
      Autorização
      <select :value="modelValue.autorizacao_publicacao"
              @change="mudarAutorizacao(modelValue, $event.target.value)">
        <option v-for="a in AUTORIZACOES" :key="a.valor" :value="a.valor">{{ a.rotulo }}</option>
      </select>
    </label>

    <p>
      Tipos
      <label v-for="t in TIPOS" :key="t.valor">
        <input v-model="modelValue.tipos" type="checkbox" :value="t.valor" /> {{ t.rotulo }}
      </label>
    </p>
    <p>
      Canal (opcional)
      <label v-for="c in CANAIS" :key="c.valor">
        <input v-model="modelValue.canais" type="checkbox" :value="c.valor" /> {{ c.rotulo }}
      </label>
    </p>

    <label>
      Status
      <select :value="modelValue.status_uso" @change="mudarStatus(modelValue, $event.target.value)">
        <option v-for="s in STATUS" :key="s.valor" :value="s.valor">{{ s.rotulo }}</option>
      </select>
    </label>
    <label>Data da postagem <input v-model="modelValue.data_postagem" type="date" /></label>
    <label>Link do post <input v-model="modelValue.link_post" type="url" /></label>
    <template v-if="descartado">
      <label>
        Motivo do descarte
        <select v-model="modelValue.motivo_descarte">
          <option value="">—</option>
          <option v-for="m in MOTIVOS" :key="m.valor" :value="m.valor">{{ m.rotulo }}</option>
        </select>
      </label>
      <label>Observação <textarea v-model="modelValue.observacao_descarte" rows="2" /></label>
    </template>
  </fieldset>
</template>

<style scoped>
.aviso { color: #b45309; font-weight: 600; }
</style>
