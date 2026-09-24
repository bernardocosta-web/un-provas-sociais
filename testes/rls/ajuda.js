import pg from 'pg'

const URL_BANCO = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

export async function conectar() {
  const cliente = new pg.Client({ connectionString: URL_BANCO })
  await cliente.connect()
  return cliente
}

async function comPapel(papel, claims, executar) {
  const cliente = await conectar()
  try {
    await cliente.query('begin')
    await cliente.query(`set local role ${papel}`)
    if (claims) {
      await cliente.query('select set_config($1, $2, true)', [
        'request.jwt.claims',
        JSON.stringify(claims),
      ])
    }
    return await executar(cliente)
  } finally {
    await cliente.query('rollback').catch(() => {})
    await cliente.end()
  }
}

export const comoAnonimo = (executar) => comPapel('anon', { role: 'anon' }, executar)

export const comoUsuario = (email, executar) =>
  comPapel('authenticated', { role: 'authenticated', email }, executar)

export const comoServico = (executar) => comPapel('service_role', null, executar)
