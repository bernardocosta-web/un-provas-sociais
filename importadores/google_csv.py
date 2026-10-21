"""Importador de avaliações do Google a partir do export CSV do banco do time tech.

Uso:
    python -m importadores.google_csv depoimentos.csv --dry-run
    python -m importadores.google_csv depoimentos.csv --dry-run --existentes ids.txt

Dedupe contra o banco: consulta o Supabase via REST (somente leitura) com
SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY lidas de importadores/.env (ou do
arquivo dado em --env, ou do ambiente). Nunca do .env do Vite (ADR 0001).
Sem credenciais e sem --existentes, o dedupe contra o banco é pulado e o
relatório avisa.

Mapeamento para o núcleo (tabela depoimento, migrações 0018/0019, ADR 0001):
    dep_texto           -> texto_completo (original; o markdown sai só na exibição)
    dep_autor_nome      -> autor_bruto
    dep_id_externo      -> id_externo (unique com fonte: chave do dedupe)
    dep_url             -> link_original
    dep_data            -> data_depoimento (só a data)
    dep_nota            -> nota (1–5)
    dep_autor_imagem    -> autor_foto_url
    dep_imagens_url     -> imagens (lista)
    dep_status          -> status_uso: ativo -> DISPONIVEL, rascunho -> EM_REVISAO
    fonte fixa          -> GOOGLE_REVIEW
    dep_curtidas não entra.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

import pandas as pd

FONTE = "GOOGLE_REVIEW"
STATUS = {"ativo": "DISPONIVEL", "rascunho": "EM_REVISAO"}
ENV_PADRAO = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")


def ler_csv(caminho):
    return pd.read_csv(caminho, dtype=str, na_values=["NULL"], encoding="utf-8")


def _vazio(v):
    return pd.isna(v) or str(v).strip() == ""


def validar_ids(df):
    vazios = [df.loc[i, "dep_id"] for i in df.index if _vazio(df.loc[i, "dep_id_externo"])]
    preenchidos = df[~df["dep_id_externo"].map(_vazio)]
    duplicados = {
        ext: list(grupo["dep_id"])
        for ext, grupo in preenchidos.groupby("dep_id_externo", sort=False)
        if len(grupo) > 1
    }
    return {"vazios": vazios, "duplicados": duplicados}


def limpar_markdown(texto):
    return texto.replace("**", "")


def _texto_ou_none(v):
    return None if _vazio(v) else v


def _imagens(v):
    if _vazio(v):
        return []
    lista = json.loads(v)
    return lista if isinstance(lista, list) else []


def mapear(linha):
    original = "" if _vazio(linha["dep_texto"]) else linha["dep_texto"]
    data = None if _vazio(linha["dep_data"]) else str(pd.to_datetime(linha["dep_data"]).date())
    return {
        "dep_id": linha["dep_id"],
        "dep_status": linha["dep_status"],
        "banco": {
            "texto_completo": original,
            "autor_bruto": _texto_ou_none(linha["dep_autor_nome"]),
            "autor_contato_bruto": None,
            "id_externo": linha["dep_id_externo"],
            "fonte": FONTE,
            "link_original": _texto_ou_none(linha["dep_url"]),
            "data_depoimento": data,
            "nota": None if _vazio(linha["dep_nota"]) else int(linha["dep_nota"]),
            "autor_foto_url": _texto_ou_none(linha["dep_autor_imagem"]),
            "imagens": _imagens(linha["dep_imagens_url"]),
            "status_uso": STATUS.get(str(linha["dep_status"]).strip(), "EM_REVISAO"),
        },
    }


def deduplicar(registros, existentes):
    novos = [r for r in registros if r["banco"]["id_externo"] not in existentes]
    ja = [r for r in registros if r["banco"]["id_externo"] in existentes]
    return novos, ja


def _get_json(url, headers):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def buscar_existentes_supabase(url_base, chave, get=_get_json):
    url = f"{url_base.rstrip('/')}/rest/v1/depoimento?select=id_externo&fonte=eq.{FONTE}&id_externo=not.is.null"
    linhas = get(url, {"apikey": chave, "Authorization": f"Bearer {chave}"})
    return {l["id_externo"] for l in linhas if l.get("id_externo")}


def carregar_env(caminho):
    """Lê KEY=VALOR de um arquivo .env simples (sem dependência externa)."""
    if not os.path.exists(caminho):
        return {}
    env = {}
    for linha in open(caminho, encoding="utf-8"):
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        k, v = linha.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def planejar(df, existentes):
    v = validar_ids(df)
    descartar = set(v["vazios"])
    for ids in v["duplicados"].values():
        descartar.update(ids[1:])  # fica a primeira ocorrência
    texto_vazio = [df.loc[i, "dep_id"] for i in df.index
                   if df.loc[i, "dep_id"] not in descartar and _vazio(df.loc[i, "dep_texto"])]
    descartar.update(texto_vazio)
    candidatos = [mapear(r) for _, r in df.iterrows() if r["dep_id"] not in descartar]
    inserir, ja = deduplicar(candidatos, existentes or set())
    datas = pd.to_datetime(df["dep_data"], errors="coerce").dropna()
    return {
        "total_lido": len(df),
        "por_status": {k: int(n) for k, n in df["dep_status"].fillna("(vazio)").value_counts().sort_index().items()},
        "vazios": v["vazios"],
        "duplicados": v["duplicados"],
        "texto_vazio": texto_vazio,
        "ja_no_banco": ja,
        "inserir": inserir,
        "intervalo_datas": (str(datas.min().date()), str(datas.max().date())) if len(datas) else (None, None),
        "dedupe_banco": existentes is not None,
    }


def _cortar(t, n):
    t = " ".join(t.split())
    return t if len(t) <= n else t[:n] + "…"


def relatorio(plano, exemplos=3, corte=150):
    dup_linhas = sum(len(v) - 1 for v in plano["duplicados"].values())
    out = [
        "IMPORTADOR GOOGLE CSV — DRY-RUN (nada foi gravado)",
        f"Total lido: {plano['total_lido']}",
        "Por status: " + ", ".join(f"{k}={n}" for k, n in plano["por_status"].items()),
        f"dep_id_externo vazio: {len(plano['vazios'])}" + (f" (dep_id {', '.join(plano['vazios'][:20])})" if plano["vazios"] else ""),
        f"dep_id_externo duplicado: {len(plano['duplicados'])} ids, {dup_linhas} linhas extras descartadas",
    ]
    for ext, ids in list(plano["duplicados"].items())[:20]:
        out.append(f"  {ext}: dep_id {', '.join(ids)}")
    out += [
        f"Texto vazio (descartado): {len(plano['texto_vazio'])}",
        "Já no banco: " + (str(len(plano["ja_no_banco"])) if plano["dedupe_banco"] else "NÃO VERIFICADO (sem credenciais nem --existentes)"),
        f"Seriam inseridos: {len(plano['inserir'])}",
        f"Intervalo de dep_data: {plano['intervalo_datas'][0]} a {plano['intervalo_datas'][1]}",
        f"Exemplos ({exemplos}):",
    ]
    for r in plano["inserir"][:exemplos]:
        b = r["banco"]
        out.append(f"  dep_id {r['dep_id']} | {b['autor_bruto']} | {b['data_depoimento']} | {r['dep_status']}")
        out.append(f"    {_cortar(limpar_markdown(b['texto_completo']), corte)}")
    return "\n".join(out)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Importa avaliações do Google (CSV) para o núcleo.")
    ap.add_argument("csv")
    ap.add_argument("--dry-run", action="store_true", help="só mostra o que seria inserido")
    ap.add_argument("--existentes", help="arquivo com um dep_id_externo por linha (alternativa ao Supabase)")
    ap.add_argument("--env", default=ENV_PADRAO, help="arquivo .env com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY")
    args = ap.parse_args(argv)
    if not args.dry_run:
        print("Inserção ainda não habilitada: rode com --dry-run.", file=sys.stderr)
        return 2
    existentes = None
    if args.existentes:
        with open(args.existentes, encoding="utf-8") as f:
            existentes = {l.strip() for l in f if l.strip()}
    else:
        env = {**os.environ, **carregar_env(args.env)}
        url, chave = env.get("SUPABASE_URL"), env.get("SUPABASE_SERVICE_ROLE_KEY")
        if url and chave:
            try:
                existentes = buscar_existentes_supabase(url, chave)
            except urllib.error.HTTPError as e:
                print(f"Falha ao consultar o banco ({e.code}). Se a coluna id_externo não existir, "
                      "aplique antes as migrações 0018 e 0019.", file=sys.stderr)
                return 3
    print(relatorio(planejar(ler_csv(args.csv), existentes)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
