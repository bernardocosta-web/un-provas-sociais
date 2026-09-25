import { describe, it, expect } from 'vitest'
import { dataDoBackup, nomeDoDump, escolherParaApagar } from '../../scripts/backup/retencao.js'

// Gera um arquivo de dump por data, com id previsivel.
function arquivo(data, criadoEm = `${data}T06:05:00.000Z`, id = `id-${data}`) {
  return { id, data, criadoEm }
}

// Datas consecutivas (UTC, sem fuso) a partir de `inicio`, `n` dias.
function dias(inicio, n) {
  const base = new Date(`${inicio}T00:00:00Z`)
  return Array.from({ length: n }, (_, i) =>
    new Date(base.getTime() + i * 86400000).toISOString().slice(0, 10))
}

function mantidos(arquivos, opcoes) {
  const apagar = new Set(escolherParaApagar(arquivos, opcoes))
  return arquivos.filter((a) => !apagar.has(a.id)).map((a) => a.data).sort()
}

describe('dataDoBackup (fuso de Sao Paulo)', () => {
  it('06:00 UTC ainda e o mesmo dia em Sao Paulo', () => {
    expect(dataDoBackup(new Date('2026-09-25T06:00:00Z'))).toBe('2026-09-25')
  })

  it('02:00 UTC ainda e o dia anterior em Sao Paulo', () => {
    expect(dataDoBackup(new Date('2026-09-25T02:00:00Z'))).toBe('2026-09-24')
  })

  it('virada de ano pelo fuso', () => {
    expect(dataDoBackup(new Date('2027-01-01T02:59:00Z'))).toBe('2026-12-31')
    expect(dataDoBackup(new Date('2027-01-01T03:00:00Z'))).toBe('2027-01-01')
  })

  it('nome do dump leva a data', () => {
    expect(nomeDoDump('2026-09-25')).toBe('banco-2026-09-25.sql.gz')
  })
})

describe('escolherParaApagar (30 diarios + 12 mensais)', () => {
  it('menos de 30 backups: nada e apagado', () => {
    const lista = dias('2026-09-01', 20).map((d) => arquivo(d))
    expect(escolherParaApagar(lista)).toEqual([])
  })

  it('lista vazia: nada a apagar', () => {
    expect(escolherParaApagar([])).toEqual([])
  })

  it('45 dias seguidos atravessando a virada de mes: 30 mais recentes + o primeiro de cada mes', () => {
    // 2026-08-10 .. 2026-09-23. Os 30 mais recentes comecam em 2026-08-25.
    const lista = dias('2026-08-10', 45).map((d) => arquivo(d))
    const ficam = mantidos(lista)
    expect(ficam).toHaveLength(31)
    expect(ficam[0]).toBe('2026-08-10') // mensal de agosto (primeiro backup do mes)
    expect(ficam[1]).toBe('2026-08-25') // inicio dos 30 diarios
    expect(ficam.at(-1)).toBe('2026-09-23')
    // setembro: o mensal (09-01) ja esta entre os diarios, nao conta duas vezes
    expect(ficam).toContain('2026-09-01')
  })

  it('o mensal e o PRIMEIRO backup do mes, nao o dia 1 do calendario', () => {
    // Julho so tem backups a partir do dia 17 (o job ficou parado).
    const julho = dias('2026-07-17', 15)
    const recentes = dias('2026-08-20', 30)
    const ficam = mantidos([...julho, ...recentes].map((d) => arquivo(d)))
    expect(ficam).toContain('2026-07-17')
    expect(ficam).not.toContain('2026-07-18')
    expect(ficam).not.toContain('2026-07-31')
  })

  it('virada de ano: dezembro e janeiro tem cada um o seu mensal', () => {
    const lista = dias('2026-11-20', 80).map((d) => arquivo(d)) // ate 2027-02-07
    const ficam = mantidos(lista)
    expect(ficam).toEqual(expect.arrayContaining(['2026-11-20', '2026-12-01', '2027-01-01']))
    expect(ficam).not.toContain('2026-12-02')
    expect(ficam).toHaveLength(30 + 3)
  })

  it('dias faltando nao encurtam a janela: sao 30 BACKUPS, nao 30 dias de calendario', () => {
    // Um backup a cada 3 dias por 120 dias: 40 backups.
    const lista = dias('2026-05-01', 120).filter((_, i) => i % 3 === 0).map((d) => arquivo(d))
    expect(lista).toHaveLength(40)
    const apagar = escolherParaApagar(lista)
    const ficam = mantidos(lista)
    // Os 30 mais recentes ficam todos, mesmo cobrindo ~90 dias de calendario.
    const trintaRecentes = lista.map((a) => a.data).sort().slice(-30)
    expect(ficam).toEqual(expect.arrayContaining(trintaRecentes))
    expect(apagar.length).toBe(40 - ficam.length)
  })

  it('mais de 12 meses: so os 12 mensais mais recentes sobrevivem', () => {
    // Um backup por mes, dia 5, por 18 meses, mais 30 diarios recentes.
    const mensais = Array.from({ length: 18 }, (_, i) => {
      const ano = 2025 + Math.floor((i + 2) / 12)
      const mes = ((i + 2) % 12) + 1
      return `${ano}-${String(mes).padStart(2, '0')}-05`
    }) // 2025-03-05 .. 2026-08-05
    const recentes = dias('2026-09-06', 30) // 2026-09-06 .. 2026-10-05
    const ficam = mantidos([...mensais, ...recentes].map((d) => arquivo(d)))
    // Meses com mensal: set/2026 e out/2026 (nos diarios) + 10 anteriores.
    expect(ficam).not.toContain('2025-10-05')
    expect(ficam).toContain('2025-11-05')
    expect(ficam).toContain('2026-08-05')
    expect(ficam).toHaveLength(30 + 10)
  })

  it('dois dumps no mesmo dia (execucao manual): fica o mais recente', () => {
    const lista = [
      arquivo('2026-09-25', '2026-09-25T06:05:00Z', 'cedo'),
      arquivo('2026-09-25', '2026-09-25T15:40:00Z', 'tarde'),
      arquivo('2026-09-24'),
    ]
    expect(escolherParaApagar(lista)).toEqual(['cedo'])
  })

  it('arquivo com data invalida nunca e apagado (so apaga o que entende)', () => {
    const lista = [
      ...dias('2026-01-01', 60).map((d) => arquivo(d)),
      { id: 'estranho', data: 'ontem', criadoEm: '2020-01-01T00:00:00Z' },
      { id: 'sem-data', criadoEm: '2020-01-01T00:00:00Z' },
      { id: 'mes-13', data: '2026-13-01', criadoEm: '2020-01-01T00:00:00Z' },
    ]
    const apagar = escolherParaApagar(lista)
    expect(apagar).not.toContain('estranho')
    expect(apagar).not.toContain('sem-data')
    expect(apagar).not.toContain('mes-13')
    expect(apagar.length).toBeGreaterThan(0)
  })

  it('limites configuraveis', () => {
    const lista = dias('2026-09-01', 10).map((d) => arquivo(d))
    expect(mantidos(lista, { diarios: 3, mensais: 1 }))
      .toEqual(['2026-09-01', '2026-09-08', '2026-09-09', '2026-09-10'])
  })
})
