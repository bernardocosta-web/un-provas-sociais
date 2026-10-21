"""Testes do importador de avaliações do Google (export CSV do banco do time tech).

Fixtures inventadas: nenhum dado real de aluno entra no repositório.
"""
import pandas as pd
import pytest

from importadores import google_csv as g

CABECALHO = (
    "dep_id,dep_origem,dep_id_externo,dep_lugar_id,dep_url,dep_autor_nome,dep_texto,"
    "dep_autor_imagem,dep_nota,dep_curtidas,dep_imagens_url,dep_data,dep_status,"
    "created_at,updated_at"
)


def linha(dep_id, externo, texto, status="ativo", data="2025-08-08 03:32:54", nome="Aluno Exemplo",
          nota="5", imagens="[]"):
    imagens = imagens.replace('"', '""')
    return (
        f'{dep_id},google,{externo},NULL,https://exemplo.test/r/{dep_id},{nome},"{texto}",'
        f'https://exemplo.test/a.jpg,{nota},3,"{imagens}",{data},{status},2025-08-18 01:20:34,2025-08-18 01:20:34'
    )


@pytest.fixture
def csv(tmp_path):
    def escrever(*linhas):
        p = tmp_path / "dep.csv"
        p.write_text("\n".join([CABECALHO, *linhas]) + "\n", encoding="utf-8", newline="\n")
        return p

    return escrever


# --- leitura -----------------------------------------------------------------

def test_le_todas_as_colunas_como_texto(csv):
    df = g.ler_csv(csv(linha(1, "000123", "Passei!")))
    assert df.loc[0, "dep_id_externo"] == "000123"  # zeros à esquerda preservados
    assert df.loc[0, "dep_nota"] == "5"
    assert all(str(t) in ("object", "str", "string") for t in df.dtypes)


def test_NULL_vira_valor_ausente(csv):
    df = g.ler_csv(csv(linha(1, "111", "Ok")))
    assert pd.isna(df.loc[0, "dep_lugar_id"])


def test_texto_com_quebra_de_linha_fica_numa_linha_so(csv):
    df = g.ler_csv(csv(linha(1, "111", "primeira\nsegunda"), linha(2, "222", "outra")))
    assert len(df) == 2
    assert df.loc[0, "dep_texto"] == "primeira\nsegunda"


# --- validação do id externo ---------------------------------------------------

def test_valida_ids_reporta_vazios(csv):
    df = g.ler_csv(csv(linha(1, "", "a"), linha(2, "NULL", "b"), linha(3, "333", "c")))
    v = g.validar_ids(df)
    assert v["vazios"] == ["1", "2"]


def test_valida_ids_reporta_duplicados(csv):
    df = g.ler_csv(csv(linha(1, "111", "a"), linha(2, "111", "b"), linha(3, "333", "c")))
    v = g.validar_ids(df)
    assert v["duplicados"] == {"111": ["1", "2"]}


def test_valida_ids_sem_problemas(csv):
    v = g.validar_ids(g.ler_csv(csv(linha(1, "111", "a"), linha(2, "222", "b"))))
    assert v == {"vazios": [], "duplicados": {}}


# --- markdown ------------------------------------------------------------------

def test_remove_negrito_markdown():
    assert g.limpar_markdown("Passei na **USP** e na **Unicamp**!") == "Passei na USP e na Unicamp!"


def test_limpar_markdown_preserva_texto_sem_marcas():
    assert g.limpar_markdown("2 * 3 = 6") == "2 * 3 = 6"


# --- mapeamento para o modelo do núcleo ---------------------------------------

def test_mapeia_para_o_nucleo_com_texto_original(csv):
    df = g.ler_csv(csv(linha(7, "999", "Fiz **7/7** em Física", nome="Fulano de Tal",
                             imagens='["https://exemplo.test/i1.jpg"]')))
    r = g.mapear(df.iloc[0])
    assert r["banco"] == {
        "texto_completo": "Fiz **7/7** em Física",  # ADR 0001: original no banco
        "autor_bruto": "Fulano de Tal",
        "autor_contato_bruto": None,
        "id_externo": "999",
        "fonte": "GOOGLE_REVIEW",
        "link_original": "https://exemplo.test/r/7",
        "data_depoimento": "2025-08-08",
        "nota": 5,
        "autor_foto_url": "https://exemplo.test/a.jpg",
        "imagens": ["https://exemplo.test/i1.jpg"],
        "status_uso": "DISPONIVEL",
    }
    assert "curtidas" not in str(r["banco"])
    assert r["dep_id"] == "7"


def test_rascunho_vira_em_revisao(csv):
    df = g.ler_csv(csv(linha(1, "111", "a", status="rascunho")))
    assert g.mapear(df.iloc[0])["banco"]["status_uso"] == "EM_REVISAO"


def test_nota_e_imagens_ausentes(csv):
    df = g.ler_csv(csv(linha(1, "111", "a", nota="NULL", imagens="NULL")))
    b = g.mapear(df.iloc[0])["banco"]
    assert b["nota"] is None and b["imagens"] == []


# --- dedupe contra o banco ------------------------------------------------------

def test_dedupe_separa_os_que_ja_existem_no_banco(csv):
    df = g.ler_csv(csv(linha(1, "111", "a"), linha(2, "222", "b")))
    regs = [g.mapear(r) for _, r in df.iterrows()]
    novos, existentes = g.deduplicar(regs, {"222"})
    assert [r["dep_id"] for r in novos] == ["1"]
    assert [r["dep_id"] for r in existentes] == ["2"]


def test_buscar_existentes_supabase_monta_consulta_e_le_ids():
    chamadas = []

    def get_falso(url, headers):
        chamadas.append((url, headers))
        return [{"id_externo": "111"}, {"id_externo": None}]

    ids = g.buscar_existentes_supabase("https://x.exemplo.test", "chave", get=get_falso)
    assert ids == {"111"}
    url, headers = chamadas[0]
    assert "/rest/v1/depoimento" in url and "fonte=eq.GOOGLE_REVIEW" in url and "select=id_externo" in url
    assert headers["apikey"] == "chave"


# --- planejamento + relatório (dry-run) ---------------------------------------

def test_planejar_exclui_vazios_duplicados_e_existentes(csv):
    df = g.ler_csv(csv(
        linha(1, "111", "a", status="ativo", data="2023-01-02 10:00:00"),
        linha(2, "111", "b", status="rascunho"),
        linha(3, "", "c"),
        linha(4, "444", "   "),
        linha(5, "555", "e", status="rascunho", data="2025-12-07 01:11:53"),
        linha(6, "666", "f"),
    ))
    p = g.planejar(df, existentes={"666"})
    assert [r["dep_id"] for r in p["inserir"]] == ["1", "5"]
    assert p["total_lido"] == 6
    assert p["por_status"] == {"ativo": 4, "rascunho": 2}
    assert p["duplicados"] == {"111": ["1", "2"]}
    assert p["vazios"] == ["3"]
    assert p["texto_vazio"] == ["4"]
    assert [r["dep_id"] for r in p["ja_no_banco"]] == ["6"]
    assert p["intervalo_datas"] == ("2023-01-02", "2025-12-07")


def test_relatorio_trunca_exemplos(csv):
    df = g.ler_csv(csv(linha(1, "111", "x" * 400)))
    texto = g.relatorio(g.planejar(df, existentes=set()), exemplos=3, corte=150)
    assert "x" * 150 + "…" in texto
    assert "x" * 151 not in texto


def test_main_sem_dry_run_nao_insere(csv, capsys):
    caminho = csv(linha(1, "111", "a"))
    codigo = g.main([str(caminho)])
    assert codigo != 0
    assert "dry-run" in capsys.readouterr().err


# --- credenciais do dry-run (ADR 0001: importadores/.env, nunca o .env do Vite) ---

def test_carregar_env_le_chaves_e_ignora_comentarios(tmp_path):
    p = tmp_path / ".env"
    linhas = ["# comentario", "SUPABASE_URL=https://x.exemplo.test", "SUPABASE_SERVICE_ROLE_KEY='segredo'", "", ""]
    p.write_text(chr(10).join(linhas), encoding="utf-8")
    assert g.carregar_env(p) == {"SUPABASE_URL": "https://x.exemplo.test", "SUPABASE_SERVICE_ROLE_KEY": "segredo"}


def test_carregar_env_inexistente_devolve_vazio(tmp_path):
    assert g.carregar_env(tmp_path / "nao-existe.env") == {}


def test_dry_run_usa_credenciais_do_env_sem_imprimir_a_chave(csv, tmp_path, capsys, monkeypatch):
    env = tmp_path / ".env"
    env.write_text(chr(10).join(["SUPABASE_URL=https://x.exemplo.test",
                                 "SUPABASE_SERVICE_ROLE_KEY=chave-secreta-xyz", ""]), encoding="utf-8")
    vistos = []
    monkeypatch.setattr(g, "buscar_existentes_supabase", lambda url, chave: vistos.append((url, chave)) or {"111"})
    assert g.main([str(csv(linha(1, "111", "a"), linha(2, "222", "b"))), "--dry-run", "--env", str(env)]) == 0
    assert vistos == [("https://x.exemplo.test", "chave-secreta-xyz")]
    saida = capsys.readouterr()
    assert "Já no banco: 1" in saida.out and "Seriam inseridos: 1" in saida.out
    assert "chave-secreta-xyz" not in saida.out + saida.err
