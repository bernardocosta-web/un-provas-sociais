// Rotulos pt-BR dos enums do banco (0002_enums.sql), na ordem da migracao.
// testes/lib/rotulos.test.js reprova valor que o banco nao conheca.
const opcoes = (pares) => pares.map(([valor, rotulo]) => ({ valor, rotulo }))

export const TIPOS = opcoes([
  ['APROVACAO', 'Aprovação'], ['ELOGIO', 'Elogio'], ['TRANSFORMACAO', 'Transformação'],
])
export const CANAIS = opcoes([
  ['PRINCIPAL', 'Principal'], ['MILITARES', 'Militares'], ['SUPERIORES', 'Superiores'],
])
export const FONTES = opcoes([
  ['GOOGLE_REVIEW', 'Avaliação do Google'], ['GOOGLE_FORMS', 'Google Forms'], ['MANUAL', 'Manual'],
])
// TRI ganha "(ENEM)" no rótulo da ficha (pedido do dono, 2026-09-25): sozinho
// "TRI" não dizia a que prova se referia. O valor gravado continua 'TRI'; o
// painel de filtros mantém seu próprio texto, mais longo ("TRI (pontuação do
// ENEM)", ver CondicoesNotas.vue), sem depender desta lista.
export const ESCALAS = opcoes([
  ['PERCENTUAL', 'Percentual'], ['PONTOS', 'Pontos'], ['TRI', 'TRI (ENEM)'],
])
export const SITUACOES = opcoes([
  ['APROVADO', 'Aprovado'], ['NAO_APROVADO', 'Não aprovado'],
])
export const PLATAFORMAS = opcoes([
  ['GOOGLE', 'Google'], ['INSTAGRAM', 'Instagram'], ['YOUTUBE', 'YouTube'],
  ['PLATAFORMA', 'Plataforma'], ['OUTRO', 'Outro'],
])
export const AUTORIZACOES = opcoes([
  ['AUTORIZADO', 'Autorizado'], ['NAO_AUTORIZADO', 'Não autorizado'],
  ['NAO_INFORMADO', 'Não informado'],
])
export const STATUS = opcoes([
  ['DISPONIVEL', 'Disponível'], ['EM_PRODUCAO', 'Em produção'], ['FEITO', 'Feito'],
  ['POSTADO', 'Postado'], ['DESCARTADO', 'Descartado'],
])
export const MOTIVOS = opcoes([
  ['QUALIDADE_BAIXA', 'Qualidade baixa'], ['SEM_AUTORIZACAO', 'Sem autorização'],
  ['DUPLICADO', 'Duplicado'], ['OUTRO', 'Outro'],
])
