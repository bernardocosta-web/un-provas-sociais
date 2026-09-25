import { createHash } from 'node:crypto'
import { verificarPastaDrive } from './verificacao.js'
import { dataDoBackup, nomeDoDump, escolherParaApagar } from './retencao.js'

// Ordem do backup, com todas as dependencias injetadas (Drive, Supabase,
// dump, Healthchecks, relogio). Layout no Drive, dentro de GDRIVE_FOLDER_ID:
//   banco-AAAA-MM-DD.sql.gz      um por execucao; retencao 30 diarios + 12 mensais
//   prints/<caminho>, logos/<caminho>   espelho INCREMENTAL dos buckets: so
//     sobe objeto novo ou alterado; nunca apaga (todo dump retido continua
//     com os seus arquivos). O estado ("ja enviado") mora no proprio Drive:
//     appProperties.chave = sha256(bucket, caminho, versao).
// Tudo que o backup cria leva appProperties.origem = MARCA.origem, e so
// arquivo com essa marca pode ser apagado.

export const MARCA = Object.freeze({ origem: 'un-provas-sociais-backup' })
export const BUCKETS = ['prints', 'logos']

const chaveDoObjeto = (bucket, { caminho, versao }) =>
  createHash('sha256').update(`${bucket}\n${caminho}\n${versao}`).digest('hex')

async function garantirPasta(drive, pastaId, bucket) {
  const propriedades = { ...MARCA, tipo: 'pasta', bucket }
  const existentes = await drive.listar({ pai: pastaId, propriedades })
  if (existentes.length) {
    return existentes.sort((a, b) => String(a.createdTime).localeCompare(String(b.createdTime)))[0]
  }
  return drive.criarPasta({ nome: bucket, pai: pastaId, propriedades })
}

async function espelharBucket({ drive, supabase, pastaId, registrar }, bucket) {
  const pasta = await garantirPasta(drive, pastaId, bucket)
  const enviados = new Set((await drive.listar({ pai: pasta.id, propriedades: { ...MARCA, tipo: 'objeto' } }))
    .map((a) => a.appProperties?.chave))
  const objetos = await supabase.listar(bucket)
  let novos = 0
  for (const objeto of objetos) {
    const chave = chaveDoObjeto(bucket, objeto)
    if (enviados.has(chave)) continue
    const conteudo = await supabase.baixar(bucket, objeto.caminho)
    await drive.enviar({ nome: objeto.caminho, pai: pasta.id, conteudo, mimeType: objeto.tipo,
      propriedades: { ...MARCA, tipo: 'objeto', bucket, chave } })
    novos++
  }
  registrar(`${bucket}: ${objetos.length} objeto(s) no bucket, ${novos} novo(s) enviado(s)`)
  return novos
}

async function aplicarRetencao({ drive, pastaId, registrar }) {
  const dumps = await drive.listar({ pai: pastaId, propriedades: { ...MARCA, tipo: 'banco' } })
  const apagar = escolherParaApagar(dumps.map((a) => ({
    id: a.id, data: a.appProperties?.data, criadoEm: a.createdTime,
  })))
  for (const id of apagar) await drive.apagar(id)
  registrar(`retencao: ${dumps.length} dump(s) no Drive, ${apagar.length} apagado(s)`)
  return apagar.length
}

export async function executarBackup(deps) {
  const { drive, supabase, executarDump, healthchecks, agora, pastaId, rota, registrar = console.log } = deps
  await healthchecks.inicio()
  let resumo
  try {
    await verificarPastaDrive(drive, pastaId, rota)
    registrar(`pasta do Drive acessivel (Rota ${rota})`)

    await supabase.pingAntiPausa()
    registrar('ping anti-pausa pela API REST: ok')

    const data = dataDoBackup(agora())
    const nome = nomeDoDump(data)
    const dump = await executarDump()
    await drive.enviar({ nome, pai: pastaId, conteudo: dump, mimeType: 'application/gzip',
      propriedades: { ...MARCA, tipo: 'banco', data } })
    registrar(`${nome}: ${dump.length} bytes enviados`)

    const novos = {}
    for (const bucket of BUCKETS) novos[bucket] = await espelharBucket(deps, bucket)

    const apagados = await aplicarRetencao(deps)
    resumo = { dump: nome, bytes: dump.length, novos, apagados }
  } catch (erro) {
    const etapa = erro.etapa ?? 'erro inesperado'
    await healthchecks.falha(`Backup falhou (${etapa}): ${erro.message}`)
    throw erro
  }
  // ULTIMA acao, sempre: e a ausencia deste ping que dispara o alarme.
  await healthchecks.sucesso(`Backup ok: ${resumo.dump} (${resumo.bytes} bytes); novos: ` +
    `prints ${resumo.novos.prints}, logos ${resumo.novos.logos}; dumps apagados: ${resumo.apagados}`)
  return resumo
}
