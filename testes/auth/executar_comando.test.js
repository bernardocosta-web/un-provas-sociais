import { describe, it, expect } from 'vitest'
import { executarComando } from './ajuda.js'

// executarComando lê `npx supabase status -o env` para os testes. O stderr
// da CLI não pode ir para o console no sucesso ("Stopped services: [...]"
// poluía a saída), mas tem de aparecer no erro quando o comando falha —
// senão só sobra "Command failed" sem o motivo.
const node = (codigo) => `node -e "${codigo}"`

describe('executarComando', () => {
  it('devolve a saída padrão no sucesso', () => {
    expect(executarComando(node("process.stdout.write('ok-saida')"))).toBe('ok-saida')
  })

  it('inclui o stderr do comando na mensagem quando ele falha', () => {
    expect(() => executarComando(
      node("process.stderr.write('motivo-da-falha-xyz'); process.exit(3)"),
    )).toThrow(/motivo-da-falha-xyz/)
  })
})
