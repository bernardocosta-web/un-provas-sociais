import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as rotulos from '../../src/lib/rotulos.js'

// Os selects e caixas da ficha usam estas listas; um valor que nao exista no
// enum do banco so estouraria (22P02) na hora de salvar. Compara com as
// migracoes, na mesma ordem: o "create type" da 0002 e, em seguida, cada
// "alter type ... add value" das migracoes posteriores (0018 em diante).
const PASTA = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url))
const sql = readFileSync(`${PASTA}0002_enums.sql`, 'utf8')
const enums = Object.fromEntries(
  [...sql.matchAll(/create type (\w+) as enum \(([^)]+)\)/g)]
    .map(([, nome, valores]) => [nome, [...valores.matchAll(/'(\w+)'/g)].map((m) => m[1])]))
for (const arquivo of readdirSync(PASTA).filter((f) => f.endsWith('.sql')).sort()) {
  const conteudo = readFileSync(`${PASTA}${arquivo}`, 'utf8')
  for (const [, nome, valor] of conteudo.matchAll(/alter type (?:public\.)?(\w+) add value (?:if not exists )?'(\w+)'/g)) {
    enums[nome].push(valor)
  }
}

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

  // Pedido do dono (2026-09-25): "TRI" sozinho na ficha nao dizia a que prova
  // se referia (o mesmo problema que a Task M5-A ja tinha corrigido no painel
  // de filtros, com "TRI (pontuação do ENEM)"). O valor gravado no banco
  // continua 'TRI' — só o rótulo mostrado muda.
  it('TRI vira "TRI (ENEM)" na ficha, sem trocar o valor gravado', () => {
    const tri = rotulos.ESCALAS.find((o) => o.valor === 'TRI')
    expect(tri.rotulo).toBe('TRI (ENEM)')
  })
})
