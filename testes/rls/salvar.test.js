import { describe, it, expect, beforeAll } from 'vitest'
import { conectar, comoUsuario } from './ajuda.js'

const MEMBRO = 'membro@exemplo.test'
const ESTRANHO = 'estranho@exemplo.test'
const ERRO_RLS = /row-level security|permission denied/

// Cada teste roda numa transacao desfeita no fim (nenhuma linha fica para
// tras) e procura so as proprias linhas, por id ou por marcador unico no
// texto — nunca por contagem global, que outro arquivo rodando em paralelo
// muda no meio do teste.
async function comoPostgres(executar) {
  const c = await conectar()
  try {
    await c.query('begin')
    return await executar(c)
  } finally {
    await c.query('rollback').catch(() => {})
    await c.end()
  }
}

async function salvar(c, ficha) {
  const { rows } = await c.query(
    'select public.salvar_depoimento($1::jsonb) as id', [JSON.stringify(ficha)])
  return Number(rows[0].id)
}

// Fixtures de nome unico: upsert idempotente (convencao da Task 11).
async function referencias(c) {
  const prova = (await c.query(
    `insert into prova (nome) values ('ENEM')
     on conflict (nome) do update set nome = excluded.nome
     returning id`)).rows[0].id
  const materia = (await c.query(
    `insert into materia (nome) values ('Fisica')
     on conflict (nome) do update set nome = excluded.nome
     returning id`)).rows[0].id
  const inst = (await c.query(
    `insert into instituicao (nome_canonico) values ('UFMG')
     on conflict (nome_canonico) do update set nome_canonico = excluded.nome_canonico
     returning id`)).rows[0].id
  return { prova: Number(prova), materia: Number(materia), inst: Number(inst) }
}

beforeAll(async () => {
  const c = await conectar()
  await c.query(
    `insert into membro_equipe (email, nome, ativo) values ($1, 'Membro Ativo', true)
     on conflict (email) do nothing`, [MEMBRO])
  await c.end()
})

describe('salvar_depoimento', () => {
  it('grava depoimento com participacao, nota e resultado', async () => {
    await comoPostgres(async (c) => {
      const { prova, materia, inst } = await referencias(c)
      const id = await salvar(c, {
        texto_completo: 'Passei! MARCADORSALVARCOMPLETO',
        fonte: 'MANUAL',
        tipos: ['APROVACAO'],
        canais: ['SUPERIORES'],
        participacoes: [{
          prova_id: prova, ano: 2025,
          notas: [{ materia_id: materia, valor_original: 100, escala: 'PERCENTUAL' }],
          resultados: [{ instituicao_id: inst, situacao: 'APROVADO' }],
        }],
      })

      const n = (await c.query(
        `select (select count(*)::int from participacao where depoimento_id = $1) as p,
                (select count(*)::int from nota n join participacao p
                   on p.id = n.participacao_id where p.depoimento_id = $1) as n,
                (select count(*)::int from resultado r join participacao p
                   on p.id = r.participacao_id where p.depoimento_id = $1) as r,
                (select count(*)::int from depoimento_tipo where depoimento_id = $1) as t,
                (select count(*)::int from depoimento_canal where depoimento_id = $1) as ca`,
        [id])).rows[0]
      expect(n).toEqual({ p: 1, n: 1, r: 1, t: 1, ca: 1 })
    })
  })

  it('nada e gravado se uma parte viola regra', async () => {
    // Autocommit de proposito: a funcao falha e a transacao dela e desfeita
    // pelo proprio Postgres. O marcador e novo, entao a contagem certa e 0.
    const MARCADOR = 'MARCADORSALVARROLLBACK'
    const c = await conectar()
    try {
      const prova = (await c.query(
        `insert into prova (nome) values ('Fuvest')
         on conflict (nome) do update set nome = excluded.nome
         returning id`)).rows[0].id

      await expect(salvar(c, {
        texto_completo: `Texto valido ${MARCADOR}`,
        fonte: 'MANUAL',
        participacoes: [{ prova_id: prova, ano: 2025, notas: [],
          resultados: [{ situacao: 'APROVADO', instituicao_id: null }] }],
      })).rejects.toThrow(/ck_aprovado_exige_instituicao/)

      const depois = (await c.query(
        'select count(*)::int n from depoimento where texto_completo like $1',
        [`%${MARCADOR}%`])).rows[0].n
      expect(depois).toBe(0)
    } finally {
      await c.end()
    }
  })

  it('observacao em branco em depoimento DISPONIVEL e gravada como NULL e aceita', async () => {
    await comoPostgres(async (c) => {
      const id = await salvar(c, {
        texto_completo: 'Obs em branco MARCADORSALVAROBS',
        fonte: 'MANUAL',
        status_uso: 'DISPONIVEL',
        observacao_descarte: '   ',
        motivo_descarte: '',
        resumo_curto: '',
        link_original: ' ',
        print_path: '',
      })
      const linha = (await c.query(
        `select observacao_descarte, motivo_descarte, resumo_curto, link_original, print_path
           from depoimento where id = $1`, [id])).rows[0]
      expect(linha).toEqual({
        observacao_descarte: null, motivo_descarte: null, resumo_curto: null,
        link_original: null, print_path: null,
      })
    })
  })

  it('campo numerico ou data em branco e gravado como NULL', async () => {
    await comoPostgres(async (c) => {
      const { prova, materia } = await referencias(c)
      const id = await salvar(c, {
        texto_completo: 'Brancos numericos MARCADORSALVARNUMERO',
        fonte: 'MANUAL',
        data_depoimento: '',
        data_postagem: '',
        aluno_id: '',
        participacoes: [{ prova_id: prova, ano: '2025',
          notas: [{ materia_id: materia, valor_original: '80', escala: 'PERCENTUAL',
            valor_maximo: '' }],
          resultados: [{ situacao: 'NAO_APROVADO', instituicao_id: '', curso_id: '' }] }],
      })
      const dep = (await c.query(
        'select data_depoimento, data_postagem, aluno_id from depoimento where id = $1',
        [id])).rows[0]
      expect(dep).toEqual({ data_depoimento: null, data_postagem: null, aluno_id: null })
      const nota = (await c.query(
        `select n.valor_maximo, n.percentual from nota n
           join participacao p on p.id = n.participacao_id where p.depoimento_id = $1`,
        [id])).rows[0]
      expect(nota.valor_maximo).toBeNull()
      expect(Number(nota.percentual)).toBe(80)
      const res = (await c.query(
        `select r.instituicao_id, r.curso_id from resultado r
           join participacao p on p.id = r.participacao_id where p.depoimento_id = $1`,
        [id])).rows[0]
      expect(res).toEqual({ instituicao_id: null, curso_id: null })
    })
  })

  it('reeditar substitui os filhos e mantem status ausente', async () => {
    await comoPostgres(async (c) => {
      const { prova, materia } = await referencias(c)
      const id = await salvar(c, {
        texto_completo: 'Original MARCADORSALVAREDICAO',
        fonte: 'MANUAL',
        status_uso: 'EM_PRODUCAO',
        tipos: ['APROVACAO', 'ELOGIO'],
        participacoes: [{ prova_id: prova, ano: 2025,
          notas: [{ materia_id: materia, valor_original: 90, escala: 'PERCENTUAL' }],
          resultados: [] }],
      })
      await salvar(c, { id, texto_completo: 'Editado MARCADORSALVAREDICAO', fonte: 'MANUAL',
        tipos: ['ELOGIO'] })
      const linha = (await c.query(
        `select texto_completo, status_uso,
                (select count(*)::int from depoimento_tipo where depoimento_id = $1) as t,
                (select count(*)::int from participacao where depoimento_id = $1) as p
           from depoimento where id = $1`, [id])).rows[0]
      expect(linha).toEqual({ texto_completo: 'Editado MARCADORSALVAREDICAO',
        status_uso: 'EM_PRODUCAO', t: 1, p: 0 })
    })
  })

  it('id inexistente e recusado com mensagem clara', async () => {
    await comoPostgres(async (c) => {
      await expect(salvar(c, { id: -1, texto_completo: 'x', fonte: 'MANUAL' }))
        .rejects.toThrow('depoimento -1 nao encontrado')
    })
  })

  // Pelo caminho do app: authenticated precisa de EXECUTE na funcao e de
  // privilegio nas tabelas (0011), e a RLS decide as linhas.
  it('membro ativo da equipe grava pela API', async () => {
    const linha = await comoUsuario(MEMBRO, async (c) => {
      const id = await salvar(c, {
        texto_completo: 'Pelo app MARCADORSALVARMEMBRO', fonte: 'MANUAL',
        observacao_descarte: '',
      })
      return (await c.query(
        'select texto_completo, observacao_descarte from depoimento where id = $1',
        [id])).rows[0]
    })
    expect(linha).toEqual({ texto_completo: 'Pelo app MARCADORSALVARMEMBRO',
      observacao_descarte: null })
  })

  it('quem nao e da equipe e barrado pela RLS', async () => {
    await expect(comoUsuario(ESTRANHO, (c) => salvar(c, {
      texto_completo: 'Intruso MARCADORSALVARESTRANHO', fonte: 'MANUAL',
    }))).rejects.toThrow(ERRO_RLS)
  })
})
