import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/un-provas-sociais/',
  plugins: [vue()],
  test: {
    environment: 'node',
    include: ['testes/**/*.test.js'],
  },
})
