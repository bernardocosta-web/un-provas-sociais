# Núcleo de Depoimentos — Design

**Projeto:** UN Provas Sociais
**Subprojeto:** #1 — Núcleo
**Data:** 2026-09-23
**Status:** aprovado, aguardando plano de implementação

---

## 1. Contexto

O Universo Narrado mantém três canais no YouTube (Principal, Militares, Superiores) e vende cursos de física e matemática para vestibulares. Milhares de depoimentos de alunos estão espalhados por avaliações do Google, respostas de Google Forms, DMs e comentários do Instagram, comentários do YouTube e comentários na plataforma de cursos.

Hoje esses depoimentos não estão em lugar nenhum. Quem monta um post de prova social procura na memória, e o risco de repetir um depoimento já usado cresce a cada semana.

O objetivo é centralizar, classificar, filtrar e preparar esses depoimentos para posts de prova social no Instagram, em carrossel de três páginas:

1. Trecho resumido do depoimento, com as logos das instituições em que o aluno passou
2. Print real da avaliação ou mensagem
3. Foto padrão

---

## 2. Decomposição em subprojetos

O sistema completo reúne subsistemas com ciclos de vida independentes. Cada um recebe sua própria spec, seu próprio plano e seu próprio ciclo de implementação.

| # | Subprojeto | Entrega |
|---|---|---|
| **1** | **Núcleo** *(esta spec)* | Modelo de dados, cadastro manual, busca e filtros |
| 2 | Importadores | Google Reviews, Google Forms, detecção de duplicatas |
| 3 | Curadoria e carrossel | Registro de N usos por depoimento, montagem das páginas, exportação |
| 4 | Classificação assistida por IA | Sugestão de tipo, resumo automático, dedupe por similaridade |

A ordem decorre das dependências. O núcleo define o schema; importar antes dele obrigaria a reescrever os parsers quando o schema mudasse. A curadoria só ganha sentido com volume de depoimentos já cadastrados. A IA precisa de exemplos classificados à mão para calibrar.

Duas responsabilidades ficaram no núcleo contra a intuição inicial:

- **Armazenamento de prints.** Um depoimento sem print não vira carrossel.
- **Cadastro de instituições.** Sem nome canônico e apelidos, o filtro "aprovado no ITA" vira busca por texto livre e falha em silêncio.

---

## 3. Escopo do subprojeto #1

### Entra

- Schema completo no Postgres, com as regras de integridade garantidas pelo banco
- Login restrito à lista de e-mails da equipe
- Cadastro manual de depoimento, com aluno, perfis, participações, notas e resultados
- Cadastros de referência: instituição (apelidos e logo), prova, curso, matéria
- Upload de print com compressão no navegador
- Busca e filtros: tipo, fonte, canal, instituição, prova, curso, ano, percentual por matéria, pontuação TRI, status e texto livre
- Fluxo de status de uso, de cinco estados, com transições explícitas
- Backup automatizado para fora do repositório
- Rotina anti-pausa do Supabase

### Não entra

| O quê | Onde vai |
|---|---|
| Importadores e detecção de duplicatas | #2 |
| Registro de N usos por depoimento, montagem do carrossel, exportação | #3 |
| Sugestão de tipo, resumo e dedupe por IA | #4 |

### Critério de pronto

A equipe cadastra cem depoimentos à mão e encontra, em segundos, quem gabaritou física e passou no ITA. O subprojeto termina aí, mesmo sem nenhum importador existir.

---

## 4. Arquitetura

Site estático no GitHub Pages. Dados no Supabase (Postgres, Auth e Storage). Sem servidor próprio. O navegador fala direto com o Supabase pelo `@supabase/supabase-js`; não existe back-end nosso no meio.

**Consequência central:** o front-end não protege nada. Qualquer pessoa abre o DevTools, lê a `anon key` e chama a API. As políticas de RLS são a única parede. A seção 7 trata disso, e a seção 8 a cobre com testes.

### Decisões de stack

**Vite como build.** O projeto irmão Dashboard_UN não tem build, mas o `CLAUDE.md` de lá trata essa ausência como o problema em correção, não como padrão a preservar. O Vite entrega três coisas concretas: `supabase-js` como dependência real em vez de script de CDN; integração nativa com o Vitest, que usa o mesmo motor; e injeção da URL e da chave a partir dos Secrets do GitHub na hora do build, deixando o código-fonte do repositório público sem chave nenhuma.

**Vue 3 como camada de tela.** Um depoimento tem N participações, cada uma com N notas e N resultados, todos adicionáveis e removíveis na mesma tela. Manipular esse aninhamento em DOM manual esconde bugs. Os componentes de arquivo único ajudam a manter arquivos pequenos.

**Regra que sustenta a testabilidade:** toda lógica pura vive em `src/lib/`, sem Vue, sem Supabase e sem DOM. O componente apenas chama. Função que só se testa abrindo o navegador está no arquivo errado.

---

## 5. Modelo de dados

### Tabelas de referência

Mantidas pela equipe, pela própria interface.

```
instituicao          id, nome_canonico*, logo_path, ativo
instituicao_apelido  id, instituicao_id->, apelido*
prova                id, nome*, instituicao_id->   (OPCIONAL)
curso                id, nome*
materia              id, nome*
```

`prova.instituicao_id` opcional faz ITA e ENEM caberem na mesma tabela. O Vestibular do ITA aponta para o ITA; o ENEM não aponta para instituição nenhuma, porque não é uma. Isso cobre também o caso dos canais Militares, em que prova e instituição quase sempre coincidem (ITA, IME, EsPCEx, AFA, EFOMM, Escola Naval).

### Núcleo

```
aluno           id, nome_exibicao, criado_em
aluno_perfil    id, aluno_id->, plataforma, identificador, url

depoimento      id, aluno_id-> (OPCIONAL),
                texto_completo (NOT NULL, não vazio),
                resumo_curto,
                autor_bruto, autor_contato_bruto,
                fonte, link_original, data_depoimento, print_path,
                autorizacao_publicacao (padrão NAO_INFORMADO),
                status_uso (padrão DISPONIVEL),
                data_postagem, link_post,
                motivo_descarte, observacao_descarte,
                criado_em, atualizado_em

depoimento_tipo  depoimento_id->, tipo     -- N tipos por depoimento
depoimento_canal depoimento_id->, canal    -- N canais, opcional (zero linhas)
```

`canal` registra a que canal do UN o depoimento se refere — Principal, Militares ou Superiores. É opcional e aceita mais de um, porque um aluno pode citar mais de uma frente de estudo, e porque muitos depoimentos não mencionam canal nenhum. Ausência de linha significa "não informado", nunca "nenhum canal".

`aluno_id` é opcional de propósito: cadastra-se o depoimento agora e amarra-se ao aluno depois. **O vínculo é sempre manual ou sugerido, nunca automático por nome**, porque nomes se repetem.

`autor_bruto` e `autor_contato_bruto` guardam o nome e o identificador **exatamente como vieram da fonte**. Sem eles, um depoimento ainda não ligado a aluno ficaria sem autor, e a sugestão de vínculo não teria com o que comparar. `autor_contato_bruto` existe para que o @ do Instagram vindo do Google Forms não se perca na importação do #2.

### Participações, notas e resultados

```
participacao  id, depoimento_id->, prova_id->, ano
nota          id, participacao_id->, materia_id->,
              valor_original, escala, valor_maximo, percentual (GERADA)
resultado     id, participacao_id->, instituicao_id-> (OPCIONAL),
              curso_id-> (OPCIONAL), situacao
```

Três níveis, e não dois, porque uma prova leva a várias aprovações. O depoimento *"gabaritei a redação do ENEM 2025 e passei na UFMG, UFJF e UFV"* produz **uma** participação, **uma** nota e **três** resultados. A nota é digitada uma vez só; no modelo de dois níveis ela precisaria ser repetida três vezes, e divergiria na primeira falha de digitação.

Participação sem nenhum resultado significa situação não informada. O caso *"gabaritei física no ENEM mas não passei"* é uma participação com nota e sem resultado, ou com resultado `NAO_APROVADO` sem instituição.

### Conjuntos fechados

Enums do Postgres, porque o código decide com base neles:

| Enum | Valores |
|---|---|
| `tipo_depoimento` | `APROVACAO`, `ELOGIO`, `TRANSFORMACAO` |
| `canal_un` | `PRINCIPAL`, `MILITARES`, `SUPERIORES` |
| `fonte_depoimento` | `GOOGLE_REVIEW`, `GOOGLE_FORMS`, `MANUAL` |
| `escala_nota` | `PERCENTUAL`, `PONTOS`, `TRI` |
| `situacao_resultado` | `APROVADO`, `NAO_APROVADO` |
| `plataforma_perfil` | `GOOGLE`, `INSTAGRAM`, `YOUTUBE`, `PLATAFORMA`, `OUTRO` |
| `autorizacao_publicacao` | `AUTORIZADO`, `NAO_AUTORIZADO`, `NAO_INFORMADO` |
| `status_uso` | `DISPONIVEL`, `EM_PRODUCAO`, `FEITO`, `POSTADO`, `DESCARTADO` |
| `motivo_descarte` | `QUALIDADE_BAIXA`, `SEM_AUTORIZACAO`, `DUPLICADO`, `OUTRO` |

Instituição, prova, curso e matéria são tabelas, não enums: crescem com o trabalho, e ninguém deveria precisar de uma migração para cadastrar uma faculdade nova.

### Escalas de nota

Os alunos citam notas em formatos incompatíveis. Cada nota guarda o valor original e a escala; o percentual é derivado.

| Escala | Exemplo | Percentual |
|---|---|---|
| `PERCENTUAL` | 100% em física | o próprio valor |
| `PONTOS` | 18 de 20 | `valor / maximo x 100` |
| `TRI` | 820 no ENEM | **nulo** |

`percentual` é **coluna gerada pelo Postgres**. Nenhum código a escreve, logo ela não tem como divergir do valor original. Os filtros de 100%, 90%+ e 70%+ leem um campo verdadeiro por construção.

A nota TRI não vira percentual e fica fora desses filtros. Ela tem filtro próprio, por pontuação. Misturar as duas famílias produziria resultado errado em silêncio, que é a pior categoria de erro para quem decide conteúdo com base no filtro.

### Fluxo de status

```
DISPONIVEL -> EM_PRODUCAO -> FEITO -> POSTADO
     +-------------+----------+---------+--> DESCARTADO
```

| Estado | Significado |
|---|---|
| `DISPONIVEL` | Recém-cadastrado, livre para uso |
| `EM_PRODUCAO` | Alguém está fazendo a arte. Bloqueia uso por outra pessoa |
| `FEITO` | Arte pronta, aguardando postagem |
| `POSTADO` | Publicado, com data |
| `DESCARTADO` | Fora de uso, com motivo |

O estado não registra quem produziu: o bloqueio é do depoimento, não da pessoa.

### Transições permitidas

A tabela abaixo é exaustiva. Toda transição fora dela é recusada.

> **Nota (2026-09-24) — decisão do dono.** Um depoimento **novo** pode nascer em qualquer status:
> cadastrar depoimentos já postados é o caso mais comum no começo. As regras de integridade (por
> exemplo, `POSTADO` exige `data_postagem`; `DESCARTADO` exige motivo) valem já na criação. A
> tabela de transições vale só na **edição** — o trigger é `BEFORE UPDATE`, compara o status anterior
> com o novo e não roda no `INSERT`.

| De | Para | Quando |
|---|---|---|
| `DISPONIVEL` | `EM_PRODUCAO` | Alguém pegou o depoimento para fazer a arte |
| `EM_PRODUCAO` | `FEITO` | Arte pronta |
| `EM_PRODUCAO` | `DISPONIVEL` | **Arte abandonada.** Libera o depoimento para outra pessoa |
| `FEITO` | `POSTADO` | Publicado |
| `FEITO` | `EM_PRODUCAO` | Arte precisa de ajuste |
| `POSTADO` | `FEITO` | Marcação equivocada, ou o post saiu do ar |
| qualquer um | `DESCARTADO` | Decisão de não usar |
| `DESCARTADO` | `DISPONIVEL` | **Reversão.** A regra 4 obriga a limpar motivo e observação |

Três consequências que decorrem da tabela e valem registrar:

**Não existe atalho de `DISPONIVEL` para `FEITO` ou `POSTADO`.** Cada degrau é explícito, senão o bloqueio de `EM_PRODUCAO` — a única coisa que impede duas pessoas de produzirem a mesma arte — seria contornável sem querer.

**`DESCARTADO` é alcançável de qualquer estado, inclusive `POSTADO`.** Um post pode sair do ar. `data_postagem` e `link_post` permanecem preenchidos após o descarte; a regra 6 só os exige **enquanto** o estado for `POSTADO`, e apagar o histórico de que algo foi publicado seria perda de informação.

**Um depoimento `NAO_AUTORIZADO` não consegue sair de `DESCARTADO`.** A reversão para `DISPONIVEL` esbarra na regra 7. Para reativá-lo é preciso antes mudar a autorização — o que é exatamente o comportamento desejado, e sai de graça da combinação das duas regras.

**Onde isso vive:** transição depende do valor anterior, que um `CHECK` não enxerga. É a única regra do sistema que exige **trigger** `BEFORE UPDATE`, comparando `OLD.status_uso` com `NEW.status_uso`. A seção 8 a cobre com teste próprio.

### Autorização de publicação

`autorizacao_publicacao` é coluna do núcleo, não campo específico do Google Forms. A regra vale para todo depoimento, venha de onde vier; restringi-la a uma fonte abriria caminho para um depoimento de outra fonte escapar da checagem.

O padrão `NAO_INFORMADO` mantém as avaliações do Google utilizáveis, que é o comportamento correto — elas são a maior fonte e não trazem pergunta de autorização.

### Regras garantidas pelo banco

Estas regras vivem em `CHECK` e chave estrangeira, não em código de aplicação.

1. `texto_completo` não pode ser vazio
2. Escala `PONTOS` exige `valor_maximo`. "18 de 20" sem o 20 é dado inútil
3. `situacao = APROVADO` exige instituição. Aprovado em lugar nenhum não existe
4. `status_uso = DESCARTADO` exige `motivo_descarte`, **e** `motivo_descarte` só existe em depoimento descartado. Vale nos dois sentidos: sem o segundo, reverter um descarte deixaria motivo órfão apontando para um depoimento ativo
5. `motivo_descarte = OUTRO` exige `observacao_descarte` não vazia
6. `status_uso = POSTADO` exige `data_postagem`. `link_post` fica opcional: campo obrigatório que o usuário não tem como preencher no momento gera preenchimento de fachada, e um link falso é pior que um campo vazio
7. `autorizacao_publicacao = NAO_AUTORIZADO` **obriga** `status_uso = DESCARTADO` com `motivo_descarte = SEM_AUTORIZACAO`. Não é apenas o bloqueio da cadeia de produção: `DISPONIVEL` significa *livre para uso*, e um depoimento sem autorização não está livre para nada. Deixá-lo disponível seria uma armadilha esperando alguém que não lê a coluna de autorização

> **Consequência operacional da regra 7:** marcar um depoimento existente como `NAO_AUTORIZADO` exige, na **mesma** operação, mudar o status para `DESCARTADO` e o motivo para `SEM_AUTORIZACAO`. Uma atualização que altere só a autorização é recusada pelo banco. A interface faz as três mudanças juntas; o importador do #2 já cria a linha no estado final.

### Minimização de dados

O schema não tem campo de e-mail, telefone, CPF ou endereço. O importador do Google Forms (#2) receberá e-mail na planilha e **descartará na entrada**. O que não vai para o post não entra no banco.

---

## 6. Interface e fluxos

Quatro telas. A primeira é onde a equipe trabalha; as outras três recebem visitas.

### 6.1 Lista de depoimentos

Filtros à esquerda, resultados à direita, contagem sempre visível.

| Filtro | Comportamento |
|---|---|
| Texto livre | busca no texto completo e no resumo |
| Tipo, Status, Canal | múltipla escolha |
| Instituição, Prova, Curso | autocompletar |
| Ano da participação | ano exato ou faixa |
| **Percentual** | N condições somadas: matéria + operador. "100% em física" **e** "90%+ em matemática" ao mesmo tempo |
| **TRI** | controle separado, por pontuação |
| Tem print? Tem link original? | sim/não |

> **Nota (2026-09-24).** A fonte não é um filtro à parte: é a aba (ver "Abas por fonte" abaixo) — "Todos" mostra todas as fontes, cada outra aba mostra uma fonte só. Reavaliar quando o subprojeto #2 trouxer mais fontes. "Tem link?" refere-se apenas ao link original (`link_original`); não existe filtro para o link do post (`link_post`).

#### Semântica: os filtros valem no nível do depoimento

**Uma condição é satisfeita se existir em *qualquer* participação do depoimento. Não é exigido que as condições se encontrem na mesma participação.**

O caso que define a regra:

> Um aluno fez o **ENEM 2025** e gabaritou física, e passou no **ITA** pelo vestibular do ITA. São duas participações distintas: a nota está numa, a aprovação está na outra.
>
> O filtro "100% em física **e** aprovado no ITA" **deve** trazer esse depoimento.

A semântica alternativa — exigir que as condições coincidam na mesma participação — devolveria vazio aqui, e estaria errada: o aluno de fato gabaritou física e de fato passou no ITA. Para prova social é isso que importa, não a contabilidade de qual prova produziu qual fato.

Na prática, cada condição vira um `EXISTS` independente sobre as participações do depoimento, e o `AND` acontece no nível do depoimento.

A mesma regra vale para o filtro de ano: "2025" com "aprovado no ITA" significa *tem alguma participação em 2025* **e** *tem aprovação no ITA*, sem exigir que a aprovação no ITA seja a de 2025. É consequência direta da escolha acima, e está registrada aqui para não ser confundida com descuido.

Isso é o oposto do que um `JOIN` ingênuo produziria, e a seção 8 trava a diferença com um teste que reprova a semântica errada.

**Abas por fonte:** Todos, Google, Forms, Manual. A aba define a fonte e troca as colunas em destaque; os demais filtros sobrevivem à troca de aba. A base é uma só — a aba é recorte de exibição, não partição de dados, e os filtros cruzados entre fontes continuam funcionando na aba Todos.

| Aba | Colunas em destaque |
|---|---|
| Todos | fonte, autor, resumo, tipos, logos, status |
| Google | autor, texto, link original, data |
| Forms | nome, **autorização**, @ do Instagram, depoimento |
| Manual | o que foi digitado |

A autorização aparece em evidência apenas na aba Forms, porque é lá que ela varia. Nas outras é sempre `NAO_INFORMADO` e viraria ruído.

**Os filtros e a aba vivem na URL.** "Aprovados no ITA com 100% em física" vira um link salvável nos favoritos e compartilhável com a equipe.

Nenhuma coluna específica por fonte será criada agora. A única identificada até aqui — a autorização — revelou-se de núcleo. Se o export do Google trouxer algo próprio, como a nota de 1 a 5, isso entra no #2, com o arquivo real na mesa.

> **Nota (2026-09-24, revisão do Marco 5).** O PostgREST devolve no máximo `max_rows` = 1000 linhas por chamada. A contagem da lista vem do total exato do banco (`count: 'exact'`), e acima do limite a tela diz "Mostrando N de TOTAL — refine os filtros". Paginação de verdade fica pendente, para quando o subprojeto #2 trouxer volume.

**Ações em massa ficam de fora de propósito:** cada post usa um depoimento, logo selecionar em lote resolveria um problema inexistente.

### 6.2 Ficha do depoimento

```
Texto completo *          Resumo curto (com contador)
Fonte    Link original    Data      Autorização
Tipos    [ ] Aprovação  [ ] Elogio  [ ] Transformação
Canal    [ ] Principal  [ ] Militares  [ ] Superiores     (opcional)
Aluno    [buscar ou criar]     Autor (como veio da fonte)
Print    [arraste, escolha ou COLE]
Status   Data da postagem      Link do post
         Motivo do descarte    Observação

-- Participações ---------------------------------
  [Prova v] [Ano]
     Notas       [Matéria v] [Valor] [Escala v] [Máx]   (+)
     Resultados  [Instituição v] [Curso v] [Situação v] (+)
  (+ participação)
```

Seis decisões de usabilidade:

**Aviso de tamanho no resumo curto, a partir de 200 caracteres.** O contador muda de cor e explica que textos longos ficam ilegíveis na página 1 do carrossel. **Nunca bloqueia e nunca corta.** O limite certo depende do tamanho da fonte e da arte, que variam; quem decide é quem monta o post, e o sistema apenas avisa. Limite rígido aqui produziria resumo truncado no meio da frase, que é pior que resumo longo.

**Colar print com Ctrl+V.** Os prints nascem de captura de tela. Salvar o arquivo, achar a pasta e arrastar é atrito repetido centenas de vezes.

**Compressão mirando o carrossel.** Redimensiona para 1280px de largura, WebP em qualidade alta. O post do Instagram tem 1080px; comprimir abaixo disso degradaria o texto do print, que é justamente o que o leitor precisa ler. A interface mostra o antes e o depois em KB.

**Criar instituição, prova ou curso sem sair da tela.** Sem isso, todo depoimento com faculdade nova vira desvio para outra tela.

**Escala com padrão inteligente.** Escolhida a prova ENEM, a escala vem TRI. Escolhido percentual, o campo "máximo" some.

**Sugestão de aluno, nunca vínculo automático.** Quando o autor bate com o perfil de um aluno existente, a interface pergunta. A equipe clica ou ignora.

### 6.3 Cadastros de referência

Instituição (nome canônico, apelidos, logo), prova, curso, matéria.

**Mesclar instituições é obrigatório, não enfeite.** Permitir criação na hora garante duplicata na primeira semana: alguém cria "UFJF" e depois "Univ. Federal de Juiz de Fora". Mesclar transforma o nome perdedor em apelido do vencedor e migra os resultados. Uma decisão obriga a outra; sem a segunda, a base apodrece devagar.

### 6.4 Alunos

Lista com nome, perfis (plataforma, identificador, link) e contagem de depoimentos. É aqui que se descobre que o aluno do Google e o do Instagram são a mesma pessoa. Trabalho manual neste subprojeto, assistido no #2.

### 6.5 Alcance

Desktop primeiro: cadastrar é trabalho de mesa. Lista e filtros funcionam no celular, porque procurar um depoimento enquanto se escreve um post acontece longe do computador. O formulário grande não tenta ser bonito no telefone.

Interface em pt-BR, como o Dashboard_UN.

---

## 7. Segurança

### Modelo de ameaça

O site é público. A `anon key` fica visível no bundle publicado — isso é desenho do produto, não falha. Uma tabela sem política de RLS fica acessível para a internet inteira, e nada no código denuncia.

### Acesso

**Login:** Supabase Auth com Google. Nenhuma senha nossa, nenhuma recuperação de senha nossa.

**Lista da equipe:** tabela `membro_equipe (email, nome, ativo)`.

**Função única de decisão:**

```sql
public.eh_membro_equipe() -> boolean
  -- lê o e-mail do JWT, confere na tabela, exige ativo
  -- SECURITY DEFINER, STABLE
```

`SECURITY DEFINER` evita que a política sobre `membro_equipe` recurse sobre si mesma.

Toda tabela recebe políticas de `SELECT`, `INSERT`, `UPDATE` e `DELETE` com a mesma condição. Um lugar para errar, um lugar para corrigir.

**`membro_equipe` não é editável pela aplicação.** Membros leem; ninguém escreve pela API. Adicionar alguém é SQL, documentado no runbook. Construir tela de administração para uma equipe de quatro pessoas gastaria esforço num problema que ocorre duas vezes por ano, e evita que uma conta comprometida adicione outra. Se a equipe crescer a ponto de a operação incomodar, a decisão se revisita.

**Nenhum e-mail real vai para o repositório** — nem em migração, nem em fixture, nem em seed. A lista é populada à mão. As fixtures usam e-mails inventados.

### Dois buckets, com políticas opostas

| Bucket | Leitura | Escrita |
|---|---|---|
| `prints` | **Privada.** URL assinada de vida curta | Só membros da equipe |
| `logos` | **Pública** | Só membros da equipe |

As políticas dos dois são migração versionada, como as de RLS.

**Por que `logos` é público.** Logo de instituição é marca pública; não há dado pessoal, nem sensível, nem comercial nela. E há um custo concreto em mantê-la privada: a lista de depoimentos mostra logos em cada linha, então uma página de cinquenta resultados exigiria dezenas de URLs assinadas a cada carregamento, com validade curta e sem cache de navegador. Trocar isso por zero ganho de segurança seria pagar caro por nada.

**Por que são dois buckets, e não um.** É um argumento de raio de explosão, não de organização. Se logos e prints dividissem o bucket, tornar a logo pública tornaria o print público junto — e o print contém nome, rosto e mensagem de aluno. Com buckets separados, **um erro na política de logos não tem como expor um print.** A separação existe para que a política mais frouxa do sistema não fique a uma linha de distância do dado mais sensível dele.

### O que fica versionado

| | Onde mora |
|---|---|
| Schema, constraints, coluna gerada | `supabase/migrations/*.sql` |
| Políticas de RLS e de Storage | `supabase/migrations/*.sql` |
| Configuração de Auth | `supabase/config.toml` |
| Client secret do Google | **fora do repo** — painel ou CLI |
| `service_role key` | **fora do repo** — Secrets do GitHub, só no job de backup |

Fora essas duas chaves, que são segredos reais, nada é configurado apenas pelo painel.

---

## 8. Testes

Toda decisão vive em `src/lib/`, sem Vue, sem Supabase e sem DOM. O componente apenas chama. Essa regra é o que torna a interface testável sem testar a interface.

### Ambiente

**Supabase local via Docker.** `supabase start` sobe a pilha em contêineres; `supabase db reset` reaplica as migrações do zero em segundos.

Alternativas descartadas e por quê:

| Opção | Motivo do descarte |
|---|---|
| Segundo projeto Supabase como dev | Consome o 2º dos 2 projetos do plano gratuito, e **pausa após uma semana de inatividade** — um projeto de desenvolvimento usado esporadicamente é, por definição, inativo. Estaria dormindo exatamente quando fosse necessário |
| Postgres puro simulando o JWT | Não testa Storage, e um desvio entre o JWT simulado e o real deixaria o teste passar com a produção vazando |

A suíte de RLS conecta direto ao Postgres local e troca de papel por comando, sem passar pela rede: fidelidade da pilha completa, velocidade do Postgres puro.

O Docker Desktop é gratuito para empresas com menos de 250 funcionários e menos de US$ 10 milhões de faturamento. **A UN se enquadra** (confirmado em 2026-09-23).

### Teste de RLS mais importante

> **Toda tabela em `public` tem RLS habilitada.** O teste varre o catálogo do Postgres e falha se qualquer tabela estiver sem.

Tabela com RLS ligada e sem política nenhuma nega tudo — falha segura. Tabela com RLS **desligada** entrega tudo pela API. A segunda é o que acontece quando alguém cria uma tabela numa migração e esquece a linha. Varrendo o catálogo, tabela nova nasce reprovada até ser protegida.

### Matriz de acesso

Para cada tabela:

| Papel | Esperado |
|---|---|
| Visitante sem login | não lê nada, não escreve nada |
| Logado fora da lista | não lê nada, não escreve nada |
| Logado inativo na lista | não lê nada, não escreve nada |
| Logado e ativo | lê e escreve |

Mais, nos dois buckets, que têm políticas opostas e por isso precisam de asserções opostas:

- Visitante **não** baixa print; membro gera URL assinada e baixa
- Visitante **lê** logo sem autenticar — o teste confirma que o bucket público é de fato público
- Visitante **não** escreve em nenhum dos dois

O terceiro é o que importa mais: "público" vale para leitura, nunca para escrita. Um bucket público onde qualquer um grava é defacement esperando acontecer.

**O teste negativo é o que importa.** Que o membro consiga ler se perceberia na hora. Que o estranho não consiga é o que ninguém percebe até o dia em que percebe.

### Regras do banco

Uma asserção por regra da seção 5: texto vazio, `PONTOS` sem máximo, aprovado sem instituição, descartado sem motivo, `OUTRO` sem observação, `POSTADO` sem data, e linha órfã.

Mais duas, que cobrem as regras novas:

**Regra 7 — autorização.** `NAO_AUTORIZADO` em qualquer estado que não seja `DESCARTADO` + `SEM_AUTORIZACAO` é recusado. Inclui explicitamente o caso `DISPONIVEL`, que é a armadilha que a regra existe para fechar. E o caso operacional: atualizar só a coluna de autorização, sem mexer no status, falha.

**Transições de status.** A tabela da seção 5 é exaustiva, então o teste percorre a matriz completa de cinco estados por cinco estados e confirma, célula a célula, que as permitidas passam e **todas as demais são recusadas**. Enumerar a matriz inteira, e não só as transições que lembramos, é o que garante que um estado novo no futuro não abra caminho silencioso.

Os dois casos de reversão que motivaram a regra ganham teste nomeado: `EM_PRODUCAO` → `DISPONIVEL` libera o depoimento, e `DESCARTADO` → `DISPONIVEL` exige motivo e observação limpos.

### Lógica pura

- Cálculo de percentual por escala, incluindo TRI, que nunca vira percentual
- Montagem do filtro: condições de nota somadas, faixas de TRI, ano, canal, combinações
- Busca de instituição por apelido: "ITA", "Tecnológico de Aeronáutica" e "ita" acham a mesma
- Validação da ficha
- Decisão de dimensão na compressão. A parte que decide é pura; o `canvas` não se testa

**O teste que trava a semântica dos filtros** merece destaque, porque é a única asserção que separa o comportamento correto do plausível.

A fixture tem um depoimento com **duas** participações: ENEM 2025 com 100% em física, e Vestibular do ITA 2025 com aprovação no ITA. O teste afirma:

| Filtro | Resultado esperado |
|---|---|
| 100% em física **e** aprovado no ITA | **encontra** |
| 100% em física | encontra |
| aprovado no ITA | encontra |
| 100% em **matemática** e aprovado no ITA | não encontra |

A primeira linha é a que importa. Uma implementação por `JOIN` ingênuo, que exige as duas condições na mesma participação, passa nas outras três e reprova só nessa. Sem ela, a semântica errada entra sem ninguém perceber e o dashboard passa a esconder justamente os depoimentos mais fortes — os de aluno aprovado com nota alta.

### Fixtures

Cobrem os casos difíceis, não os fáceis: ENEM com uma nota e três resultados; nota sem aprovação; `PONTOS` 18 de 20; TRI 950; depoimento sem aluno; depoimento sem print; depoimento `NAO_AUTORIZADO`.

**Nenhum dado real de aluno em fixture**, seguindo a disciplina do `exec-payload-anon.json` do Dashboard_UN. Fixture é inventada.

---

## 9. Backup, anti-pausa e resiliência

Um job diário do GitHub Actions cobre backup e anti-pausa.

### Backup

**O que sai:** dump completo do banco em SQL, mais os arquivos novos dos **dois** buckets — `prints` e `logos` — desde a última execução. As logos entram no backup porque são trabalho acumulado: recadastrar cinquenta logos à mão custa uma tarde, e o fato de serem públicas não as torna recuperáveis.

**Para onde vai:** Google Drive. **Como** chegar lá depende de a UN ter Google Workspace, e as duas rotas são incompatíveis entre si.

> **Conta de serviço do Google não tem cota de armazenamento.** Compartilhar uma pasta do "Meu Drive" com ela **não resolve**: a gravação falha com `storageQuotaExceeded`, porque o arquivo seria de propriedade da conta de serviço, que não tem onde guardá-lo. Essa é a armadilha clássica desta integração — o compartilhamento dá permissão, e permissão não é cota.

**Rota A — Drive compartilhado (preferencial), se a UN tiver Google Workspace.**
Num *shared drive*, os arquivos pertencem ao drive, não a quem os cria. A conta de serviço entra como membro com permissão de gravação e passa a escrever normalmente, consumindo a cota da organização. É a rota preferencial porque o backup deixa de depender da conta pessoal de uma pessoa: se Bernardo sair da empresa ou trocar de conta, o backup continua.

**Rota B — OAuth com a conta pessoal, se não houver Workspace.**
O job autentica **como Bernardo**, por *refresh token* guardado no Secret `GDRIVE_REFRESH_TOKEN`. Os arquivos ficam no Drive dele e consomem os 15 GB dele — suficiente por anos, para dumps de um banco de 500 MB e prints comprimidos.

> **Condição obrigatória da Rota B:** o app no Google Cloud precisa estar publicado **"Em produção"**. Enquanto estiver em "Modo de teste", o refresh token **expira em 7 dias** — e o backup pararia toda semana, sempre por um motivo que não aparece como erro de código. Publicar exige apenas escopos básicos, sem processo de verificação.

A rota escolhida muda apenas o mecanismo de autenticação do job. Destino, retenção, ensaio de restauração e vigia permanecem idênticos.

**Retenção:** 30 diários e 12 mensais. O job apaga o excedente.

**Ensaio de restauração — requisito, não sugestão.** Antes de o subprojeto #1 ser declarado pronto, um backup real é restaurado num Supabase local e os números conferidos. `docs/runbook-backup.md` registra o procedimento e a data do último ensaio. Backup nunca restaurado é ficção, e a descoberta acontece no pior dia possível.

### Anti-pausa

A documentação oficial do Supabase diz:

> "We may pause applications on the Free Plan that exhibit low activity in a 7-day period to save on server resources."
> — <https://supabase.com/docs/guides/platform/going-into-prod>

**O critério de atividade não está documentado.** A página não esclarece se conta requisição de API, conexão de banco, acesso ao painel, ou alguma combinação. Portanto o job **não assume** que o `pg_dump` conte como atividade: além do dump, ele faz uma requisição leve pela API REST do Supabase, autenticada com a `service_role key`. Duas portas diferentes, porque não sabemos qual delas o Supabase observa.

### Risco: o GitHub desativa workflows agendados

A documentação do GitHub diz:

> "In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days."
> — <https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows>

**Este é o risco mais traiçoeiro do projeto.** Depois que o núcleo estiver pronto, o repositório pode passar meses sem commit. No 61º dia o GitHub desativa o agendamento; o backup e a rotina anti-pausa morrem juntos e **em silêncio**; uma semana depois o Supabase pausa o projeto; e ninguém descobre até tentar abrir o dashboard.

### Vigia: dead man's switch no Healthchecks.io

**A proteção principal.** Ao terminar com sucesso, o job diário de backup faz um ping numa URL do Healthchecks.io (plano gratuito). Se o ping não chegar dentro do prazo configurado, Bernardo recebe alerta por e-mail.

**Por que esta é a proteção que funciona:** ela inverte a pergunta. Em vez de detectar que algo falhou, detecta que o sucesso **não aconteceu**. Essa inversão é o que cobre o modo de falha mais perigoso — o job que simplesmente deixa de existir. Um job desativado não falha; ele não acontece, e nenhum alerta de falha jamais dispara.

Uma única proteção cobre os três modos de falha:

| Falha | Como o ping reage |
|---|---|
| O dump quebra | Job não chega ao fim, ping não sai, alerta dispara |
| A requisição anti-pausa não acontece | Mesma coisa: o ping é a última etapa do job |
| O GitHub desativa o agendamento no 61º dia | O job não roda, ping não sai, alerta dispara |

**O Healthchecks.io não compartilha nenhum destino de falha com o que vigia.** É a diferença decisiva em relação a um vigia hospedado no próprio GitHub Actions, que seria desativado junto com o vigiado no 61º dia. Vigia sujeito à mesma falha do vigiado não é redundância, é ilusão de redundância.

**A URL de ping é segredo.** Vai para os Secrets do GitHub como `HEALTHCHECKS_PING_URL`, nunca para o repositório: quem a tiver consegue silenciar o alarme pingando no lugar do job.

### Resposta ao alerta

Procedimento no `runbook-backup.md`, na ordem:

1. **Conferir se o workflow agendado foi desativado.** Na aba Actions do repositório, um workflow desativado por inatividade aparece marcado como tal. Reativar pelo próprio painel.
2. **Conferir se o projeto Supabase pausou.** Projeto pausado aparece assim no painel do Supabase e é restaurado por lá. A restauração leva alguns minutos e não perde dados.
3. **Rodar o backup manualmente** e confirmar que o ping chegou ao Healthchecks.io antes de considerar o incidente encerrado.

### Reforço opcional, documentado e não implementado agora

Um disparo externo diário pelo **cron-job.org** (gratuito), chamando `workflow_dispatch`, com token do GitHub de escopo mínimo: apenas este repositório, apenas permissão de *actions*.

Fica documentado e fora do escopo do #1 por dois motivos. Primeiro, o dead man's switch já cobre os três modos de falha, e o reforço apenas encurtaria o tempo até a correção. Segundo — e mais relevante — **a documentação do GitHub não esclarece se um workflow desativado por inatividade ainda aceita `workflow_dispatch`**, nem se um disparo por API conta como "atividade no repositório". Um reforço cuja eficácia não se pode afirmar não deve ser tratado como garantia, e não vale gastar um token de acesso agora para obtê-lo.

### Segredos

Todos nos Secrets do GitHub, nenhum no repositório.

```
SUPABASE_DB_URL              string de conexão do dump
SUPABASE_SERVICE_ROLE_KEY    leitura dos arquivos e ping de atividade
GDRIVE_FOLDER_ID             pasta de destino
GDRIVE_SA_JSON               Rota A: credencial da conta de serviço
GDRIVE_OAUTH_CLIENT          Rota B: client id e secret do app
GDRIVE_REFRESH_TOKEN         Rota B: refresh token da conta de Bernardo
HEALTHCHECKS_PING_URL        dead man's switch — silencia o alarme se vazar
VITE_SUPABASE_URL            build
VITE_SUPABASE_ANON_KEY       build
```

---

## 10. Repositório e deploy

```
un-provas-sociais/
  .github/workflows/
    testes.yml       vitest + RLS no Supabase local (todo push)
    deploy.yml       build Vite + publica no Pages (main, se testes passam)
    migracoes.yml    aplica migrações em produção — MANUAL
    backup.yml       cron diário + workflow_dispatch: dump, Drive,
                     ping anti-pausa no Supabase, ping final no Healthchecks
  supabase/
    config.toml      configuração de Auth versionada
    migrations/      schema, RLS, storage — a fonte da verdade
    seed.sql         dados fictícios para desenvolvimento
  src/
    lib/             lógica pura — sem Vue, sem Supabase, sem DOM
    dados/           única camada que conhece o SDK do Supabase
    componentes/     Vue, sem lógica
    telas/           lista, ficha, cadastros, alunos
  testes/
    lib/  rls/  fixtures/
  docs/
    superpowers/specs/   decisions/   runbook-backup.md   runbook-equipe.md
  index.html  package.json  .gitignore  CLAUDE.md
```

### Decisões de deploy

**Migrações nunca se aplicam sozinhas.** `deploy.yml` publica o site a cada push na main; `migracoes.yml` só roda por acionamento manual. Deploy de front ruim se corrige com outro push. Migração ruim se corrige com backup, e é a única operação aqui sem desfazer barato.

**Rotas por hash** (`#/depoimentos?instituicao=ita`). O GitHub Pages não reescreve URL para aplicação de página única; com hash o problema não existe, e os filtros salváveis continuam funcionando.

**`base` do Vite = `/un-provas-sociais/`**, porque o Pages serve em subpasta. Errar isso quebra todos os caminhos no ar e funciona perfeitamente na máquina local.

**`.gitignore`:** `.env*`, `node_modules/`, `dist/`, `supabase/.temp/`, `backups/`, e qualquer print local.

**`CLAUDE.md` do projeto**, no espírito do Dashboard_UN: o que é, como trabalhar, e os invariantes que nunca se quebram — RLS em toda tabela, percentual é coluna gerada, nenhum dado real no repositório.

---

## 11. Riscos registrados

| Risco | Impacto | Mitigação |
|---|---|---|
| GitHub desativa workflows agendados após 60 dias sem atividade no repositório | Backup e anti-pausa morrem em silêncio; o projeto Supabase pausa uma semana depois | **Dead man's switch no Healthchecks.io**: o alerta dispara pela *ausência* do ping, não pela falha — e o serviço não compartilha destino de falha com o que vigia. Resposta ao alerta no runbook |
| Critério de inatividade do Supabase não documentado | Pausa apesar do backup diário | O job bate em duas portas: conexão de banco e API REST |
| Política de RLS mal escrita | Dados de alunos expostos na internet | Suíte de RLS com varredura de catálogo e matriz de quatro papéis |
| Tabela nova criada sem RLS | Mesma coisa, sem aviso | O teste varre o catálogo: tabela nova nasce reprovada |
| Duplicata de instituição por criação na hora | Filtros passam a mentir devagar | Função de mesclar na tela de cadastros |
| Conta de serviço não tem cota no Drive: gravar em pasta do "Meu Drive" falha com `storageQuotaExceeded` | Backup nunca chega a funcionar, e o erro parece de permissão | Rota A, Drive compartilhado do Workspace (preferencial); Rota B, OAuth com a conta de Bernardo |
| App OAuth em "Modo de teste" | Refresh token expira a cada 7 dias e o backup para toda semana, sem erro de código aparente | Publicar o app "Em produção" — ação manual, obrigatória na Rota B |
| Rota B depende da conta pessoal de uma pessoa | Backup morre se Bernardo sair da empresa ou trocar de conta | Preferir a Rota A sempre que houver Workspace |
| Fornecedor muda o plano gratuito | Migração forçada | Postgres padrão; o dump vai para qualquer outro Postgres |
| `link_post` opcional reduz rastreabilidade | Post publicado sem link registrado | Aceito conscientemente: link de fachada é pior que campo vazio |

---

## 12. Ações manuais de Bernardo

Vão para `docs/runbook-backup.md` e `docs/runbook-equipe.md`.

1. **Verificar se a UN já tem projetos Supabase ativos.** O plano gratuito permite 2. Fazer antes de criar o projeto do dashboard.
2. **Verificar se a UN tem Google Workspace.** Esta resposta decide a rota de backup e não tem meio-termo:
   - **Tem Workspace → Rota A.** Criar um Drive compartilhado, adicionar a conta de serviço como membro com permissão de gravação, e guardar o id da pasta.
   - **Não tem → Rota B.** Criar a pasta no Drive pessoal e gerar o refresh token da própria conta.
3. **Criar o OAuth client no Google Cloud** e registrar o client secret no painel do Supabase, nunca no repositório.
4. **Publicar a tela de consentimento OAuth "Em produção"**, com escopos básicos e sem processo de verificação. Serve a dois propósitos ao mesmo tempo: o login sai da lista de usuários de teste, e — na Rota B — o refresh token do backup deixa de expirar a cada 7 dias.

   > **Nota (2026-09-24).** Feito: a tela de consentimento está publicada "Em
   > produção", com **home** `https://bernardocosta-web.github.io/un-provas-sociais/`
   > e **política de privacidade**
   > `https://bernardocosta-web.github.io/un-provas-sociais/privacidade.html`,
   > exigidas pelo Google para essa publicação. Os domínios autorizados são o do
   > projeto Supabase e `bernardocosta-web.github.io`. A página de privacidade
   > mora em `public/privacidade.html`, fora da SPA — o Vite copia `public/`
   > para `dist/` sem processar — e seu e-mail de contato é público por escolha
   > do dono (ver exceção na invariante de dados reais no `CLAUDE.md`).

5. **Popular `membro_equipe`** com os e-mails da equipe, por SQL, conforme o `runbook-equipe.md`.
6. **Criar conta no Healthchecks.io** (plano gratuito), criar o check do backup diário com o prazo e o e-mail de alerta, e guardar a URL de ping no Secret `HEALTHCHECKS_PING_URL`. A URL nunca vai para o repositório.
7. **Executar o ensaio de restauração** e registrar a data no runbook.
8. **Provocar o alerta de propósito, uma vez.** Deixar o check expirar e confirmar que o e-mail chega. Vigia nunca disparado tem o mesmo valor de backup nunca restaurado.

### Runbook de equipe

`docs/runbook-equipe.md` documenta, passo a passo, como adicionar e remover um membro sem tela de administração e sem e-mail no repositório: abrir o SQL Editor do painel do Supabase, inserir ou desativar a linha em `membro_equipe`, e conferir o acesso. Remover é marcar `ativo = false`, não apagar a linha — o histórico de quem teve acesso tem valor, e apagar apagaria a rastreabilidade.

A equipe tem quatro pessoas hoje e pode crescer.

---

## 13. Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| **Cloudflare Pages + Workers + D1 + R2** | Tecnicamente a mais forte, mas o Cloudflare Access exige o DNS de um domínio próprio, e Bernardo não administra o DNS de `universonarrado.com` |
| **Google Sheets + Apps Script + Drive** | O código do servidor viveria fora do repositório, deixando metade do sistema sem TDD; autenticação artesanal; sem integridade referencial |
| **Back-end próprio com SQLite em servidor do TI** | Melhor em testabilidade, mas cria dependência organizacional maior que a do Cloudflare já recusada, e o tempo de deploy ficaria fora do controle de quem desenvolve |
| **Container agora, hospedagem depois** | Sem servidor alternativo, não é neutralidade: é o cenário do TI com outro nome |
| **SQLite em pasta sincronizada (Drive/OneDrive)** | Escrita concorrente sobre pasta sincronizada corrompe o arquivo |
| **Tempo real com WebSocket/SSE** | A equipe precisa ver os mesmos dados ao carregar a página, não a tela mudando sozinha. Não vale o custo |
| **Segundo projeto Supabase como ambiente de dev** | Consome o 2º dos 2 projetos e pausa por inatividade — dormiria justamente quando fosse necessário |
| **Tela de administração de membros** | Quatro pessoas, duas alterações por ano. SQL documentado resolve, e reduz a superfície de ataque |
| **Ações em massa na lista** | Cada post usa um depoimento |
| **Colunas específicas por fonte** | A única identificada revelou-se de núcleo. As demais esperam o export real, no #2 |

---

## 14. Próximo passo

Plano de implementação pela skill `superpowers:writing-plans`, **após revisão desta spec por Bernardo**.
