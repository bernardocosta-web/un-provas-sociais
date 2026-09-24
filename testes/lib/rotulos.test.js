import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as rotulos from '../../src/lib/rotulos.js'

// Os selects e caixas da ficha usam estas listas; um valor que nao exista no
// enum do banco so estouraria (22P02) na hora de salvar. Compara com a
// migracao, na mesma ordem.
const sql = readFileSync(
  fileURLToPath(new URL('../../supabase/migrations/0002_enums.sql', import.meta.url)), 'utf8')
const enums = Object.fromEntries(
  [...sql.matchAll(/create type (\w+) as enum \(([^)]+)\)/g)]
    .map(([, nome, valores]) => [nome, [...valores.matchAll(/'(\w+)'/g)].map((m) => m[1])]))

const PARES = {
  tipo_depoimento: 'TIPOS',
  canal_un: 'CANAIS',
  fonte_depoimento: 'FONTES',
  escala_nota: 'ESCALAS',
  situacao_resultado: 'SITUACOES',
  plataforma_perfil: 'PLATAFORMAS',
  autorizacao_publicacao: 'AUTORIZACOES',
  status_uso: 'STATUS',
  motivo_descarte: 'MOTIVOS',
}

describe('rotulos da ficha', () => {
  for (const [tipo, lista] of Object.entries(PARES)) {
    it(`${lista} tem exatamente os valores de ${tipo}`, () => {
      expect(enums[tipo]?.length).toBeGreaterThan(0)
      expect(rotulos[lista].map((o) => o.valor)).toEqual(enums[tipo])
      for (const o of rotulos[lista]) expect(o.rotulo.trim()).not.toBe('')
    })
  }
})
