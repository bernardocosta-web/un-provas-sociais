import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/un-provas-sociais/',
  plugins: [vue()],
  test: {
    environment: 'node',
    include: ['testes/**/*.test.js'],
    // Chaves da stack local lidas uma vez (nao uma por worker).
    globalSetup: ['testes/setup-global.js'],
  },
})
