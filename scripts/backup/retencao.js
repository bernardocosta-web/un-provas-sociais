// Logica pura do backup: data do backup, nome do dump e retencao. Sem I/O,
// sem relogio proprio (a data entra por parametro) — testavel com calendario
// inventado (testes/backup/retencao.test.js).

const FUSO = 'America/Sao_Paulo'
const DATA_VALIDA = /^(\d{4})-(\d{2})-(\d{2})$/

// Data do backup no fuso da UN. O cron roda 06:00 UTC (03:00 em Sao Paulo),
// mas uma execucao manual de madrugada nao pode cair no dia errado.
export function dataDoBackup(agora, fuso = FUSO) {
  // en-CA formata como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora)
}

export function nomeDoDump(data) {
  return `banco-${data}.sql.gz`
}

function dataValida(data) {
  const m = DATA_VALIDA.exec(data ?? '')
  if (!m) return false
  const d = new Date(`${data}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === data
}

// Recebe os dumps que o PROPRIO backup criou ({ id, data: 'AAAA-MM-DD',
// criadoEm: ISO }) e devolve os ids a apagar. Regra:
// - diarios: os `diarios` backups mais recentes (por data distinta). Conta
//   backups, nao dias de calendario: dias sem backup nao encurtam a janela.
// - mensais: o PRIMEIRO backup de cada mes; ficam os dos `mensais` meses mais
//   recentes que tem backup (o mes corrente conta).
// - dois dumps na mesma data (execucao manual): fica o mais recente.
// - arquivo com data que nao entende nunca e apagado.
export function escolherParaApagar(arquivos, { diarios = 30, mensais = 12 } = {}) {
  const validos = arquivos.filter((a) => dataValida(a.data))

  const porData = new Map()
  for (const a of validos) {
    if (!porData.has(a.data)) porData.set(a.data, [])
    porData.get(a.data).push(a)
  }
  const representante = new Map()
  for (const [data, lista] of porData) {
    lista.sort((x, y) => String(y.criadoEm).localeCompare(String(x.criadoEm)) ||
      String(y.id).localeCompare(String(x.id)))
    representante.set(data, lista[0])
  }

  const datas = [...porData.keys()].sort().reverse()
  const ficam = new Set(datas.slice(0, diarios))

  const primeiroDoMes = new Map()
  for (const data of [...datas].reverse()) {
    const mes = data.slice(0, 7)
    if (!primeiroDoMes.has(mes)) primeiroDoMes.set(mes, data)
  }
  const meses = [...primeiroDoMes.keys()].sort().reverse().slice(0, mensais)
  for (const mes of meses) ficam.add(primeiroDoMes.get(mes))

  const idsQueFicam = new Set([...ficam].map((data) => representante.get(data).id))
  return validos.filter((a) => !idsQueFicam.has(a.id)).map((a) => a.id)
}
