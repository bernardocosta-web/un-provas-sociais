<script setup>
import { entrarComGoogle } from '../dados/sessao.js'
</script>

<template>
  <section>
    <h1>UN Provas Sociais</h1>
    <p>Acesso restrito à equipe.</p>
    <button @click="entrarComGoogle">Entrar com Google</button>
  </section>
</template>
