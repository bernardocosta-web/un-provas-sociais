import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { verificarPastaDrive } from '../../scripts/backup/verificacao.js'
import { criarClienteDrive } from '../../scripts/backup/drive.js'
import { ErroBackup } from '../../scripts/backup/erros.js'
import { subirDriveFalso, TOKEN_FALSO } from './ajuda/driveFalso.js'

let drive
let falha
beforeEach(async () => {
  falha = () => null
  drive = await subirDriveFalso({
    pastas: [
      { id: 'pasta-ok' },
      { id: 'na-lixeira', trashed: true },
      { id: 'um-arquivo', mimeType: 'application/pdf' },
    ],
    falhar: (req, url) => falha(req, url),
  })
})
afterEach(() => drive.fechar())

const cliente = (obterToken = async () => TOKEN_FALSO) =>
  criarClienteDrive({ obterToken, urlApi: drive.url, esperar: async () => {} })

async function mensagem(pastaId, rota = 'B', c = cliente()) {
  const erro = await verificarPastaDrive(c, pastaId, rota).catch((e) => e)
  expect(erro).toBeInstanceOf(ErroBackup)
  expect(erro.etapa).toBe('verificacao da pasta do Drive')
  return erro.message
}

describe('verificarPastaDrive', () => {
  it('pasta existente e fora da lixeira: devolve os dados', async () => {
    await expect(verificarPastaDrive(cliente(), 'pasta-ok', 'B')).resolves.toMatchObject({ id: 'pasta-ok' })
  })

  it('404: explica id, escopo drive.file e que na Rota B a pasta tem de ter sido criada pelo app', async () => {
    const m = await mensagem('nao-existe')
    expect(m).toMatch(/GDRIVE_FOLDER_ID/)
    expect(m).toMatch(/404/)
    expect(m).toMatch(/drive\.file/)
    expect(m).toMatch(/criada pelo proprio app/)
    expect(m).toMatch(/OAuth Playground/)
    expect(m).toMatch(/Rota B/)
  })

  it('404 na Rota A lembra da conta de servico como membro do Drive compartilhado', async () => {
    expect(await mensagem('nao-existe', 'A')).toMatch(/Rota A.*conta de servico.*Drive compartilhado/s)
  })

  it('403: permissao/escopo/API habilitada', async () => {
    falha = () => ({ status: 403, motivo: 'insufficientPermissions' })
    const m = await mensagem('pasta-ok')
    expect(m).toMatch(/403/)
    expect(m).toMatch(/Google Drive API/)
    expect(m).toMatch(/drive\.file/)
  })

  it('401: credencial recusada pelo Drive', async () => {
    const m = await mensagem('pasta-ok', 'B', cliente(async () => 'token-errado'))
    expect(m).toMatch(/401/)
    expect(m).toMatch(/credencial/)
    expect(m).toMatch(/GDRIVE_REFRESH_TOKEN/)
  })

  it('falha ao obter o token: a mensagem do token vem junto', async () => {
    const semToken = async () => { throw new ErroBackup('O Google recusou GDRIVE_REFRESH_TOKEN: invalid_grant', { etapa: 'credencial Google' }) }
    const m = await mensagem('pasta-ok', 'B', cliente(semToken))
    expect(m).toMatch(/invalid_grant/)
  })

  it('pasta na lixeira e arquivo que nao e pasta sao recusados', async () => {
    expect(await mensagem('na-lixeira')).toMatch(/lixeira/)
    expect(await mensagem('um-arquivo')).toMatch(/nao e uma pasta/)
  })
})
