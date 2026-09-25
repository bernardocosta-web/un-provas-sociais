import { ErroBackup } from './erros.js'

// Primeira coisa que o backup faz (antes do dump): confirmar que alcanca a
// pasta do Drive. Falha aqui = mensagem que diz o que conferir, e nenhum
// upload nem ping de sucesso. Ver docs/runbook-backup.md, "Ler a mensagem do
// verificador de pasta".

const ETAPA = 'verificacao da pasta do Drive'
const PASTA = 'application/vnd.google-apps.folder'

function dicaDeRota(rota) {
  return rota === 'A'
    ? 'Rota A: a conta de servico de GDRIVE_SA_JSON tem de ser membro (Colaborador) do Drive ' +
      'compartilhado que contem a pasta.'
    : 'Rota B (OAuth): com o escopo drive.file o app so enxerga o que ele mesmo criou, entao a ' +
      'pasta tem de ter sido criada pelo proprio app, pelo OAuth Playground (Step 3 do checklist), ' +
      'com o mesmo client e a mesma conta do GDRIVE_REFRESH_TOKEN. Pasta criada pela interface ' +
      'normal do Drive responde 404 mesmo existindo.'
}

function explicar(erro, rota) {
  const inicio = `Nao consegui acessar a pasta do backup no Google Drive (Rota ${rota}).`
  switch (erro.status) {
    case 404:
      return `${inicio} O Drive respondeu 404 (pasta nao encontrada para esta credencial). ` +
        `Confira o id em GDRIVE_FOLDER_ID (o trecho final da URL da pasta, ou o "id" devolvido no ` +
        `OAuth Playground). ${dicaDeRota(rota)}`
    case 403:
      return `${inicio} O Drive respondeu 403 (${erro.motivo ?? 'sem permissao'}). Confira se a ` +
        'Google Drive API esta habilitada no projeto "UN Aprovados", se o escopo concedido e ' +
        `https://www.googleapis.com/auth/drive.file e se a pasta pertence a esta credencial. ${dicaDeRota(rota)}`
    case 401:
      return `${inicio} O Drive respondeu 401: a credencial foi recusada. ` +
        (rota === 'A'
          ? 'Confira GDRIVE_SA_JSON.'
          : 'Confira GDRIVE_REFRESH_TOKEN e GDRIVE_OAUTH_CLIENT (client "UN Aprovados Web").')
    default:
      return `${inicio} ${erro.message}`
  }
}

export async function verificarPastaDrive(drive, pastaId, rota) {
  let pasta
  try {
    pasta = await drive.obterArquivo(pastaId)
  } catch (erro) {
    const mensagem = erro.status ? explicar(erro, rota)
      : `Nao consegui acessar a pasta do backup no Google Drive (Rota ${rota}): ${erro.message}`
    throw new ErroBackup(mensagem, { etapa: ETAPA, causa: erro })
  }
  if (pasta.mimeType !== PASTA) {
    throw new ErroBackup(`GDRIVE_FOLDER_ID aponta para "${pasta.name}", que nao e uma pasta ` +
      `(${pasta.mimeType}). Confira o id.`, { etapa: ETAPA })
  }
  if (pasta.trashed) {
    throw new ErroBackup(`A pasta do backup ("${pasta.name}") esta na lixeira do Drive. Restaure-a ` +
      'pela lixeira (nao crie outra pela interface: na Rota B ela ficaria invisivel para o app).',
    { etapa: ETAPA })
  }
  return pasta
}
