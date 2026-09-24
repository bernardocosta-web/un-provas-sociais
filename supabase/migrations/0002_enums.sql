create type tipo_depoimento as enum ('APROVACAO', 'ELOGIO', 'TRANSFORMACAO');
create type canal_un as enum ('PRINCIPAL', 'MILITARES', 'SUPERIORES');
create type fonte_depoimento as enum ('GOOGLE_REVIEW', 'GOOGLE_FORMS', 'MANUAL');
create type escala_nota as enum ('PERCENTUAL', 'PONTOS', 'TRI');
create type situacao_resultado as enum ('APROVADO', 'NAO_APROVADO');
create type plataforma_perfil as enum ('GOOGLE', 'INSTAGRAM', 'YOUTUBE', 'PLATAFORMA', 'OUTRO');
create type autorizacao_publicacao as enum ('AUTORIZADO', 'NAO_AUTORIZADO', 'NAO_INFORMADO');
create type status_uso as enum ('DISPONIVEL', 'EM_PRODUCAO', 'FEITO', 'POSTADO', 'DESCARTADO');
create type motivo_descarte as enum ('QUALIDADE_BAIXA', 'SEM_AUTORIZACAO', 'DUPLICADO', 'OUTRO');
