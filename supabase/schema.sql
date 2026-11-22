-- Esteira de Repertório: cole tudo no Supabase > SQL Editor > Run.
-- Todas as tabelas têm o prefixo esteira_ para conviver com outros projetos no mesmo banco.

create sequence if not exists esteira_criativo_numero_seq;

create or replace function esteira_proximo_numero() returns bigint
language sql as $$ select nextval('esteira_criativo_numero_seq') $$;

create table if not exists esteira_usuarios (
  id text primary key,
  nome text not null,
  pin text not null,
  papel text not null default 'operador' check (papel in ('operador', 'admin'))
);

create table if not exists esteira_criativos (
  id text primary key,
  numero bigint unique not null,
  data date not null,
  criado_em timestamptz not null default now(),
  operador text not null references esteira_usuarios(id),
  operador_nome text not null,
  nicho text not null,
  faixa text not null check (faixa in ('Core', 'Adjacente', 'Aleatório')),
  anunciante text,
  link_biblioteca text unique not null,
  formato text not null,
  hook_visual text not null,
  retencao text not null,
  impressoes text,
  ficha jsonb not null,
  video jsonb
);
create index if not exists esteira_criativos_data_idx on esteira_criativos (data);

create table if not exists esteira_listas (
  tipo text not null check (tipo in ('nicho', 'formato')),
  valor text not null,
  criado_em timestamptz not null default now(),
  primary key (tipo, valor)
);

create table if not exists esteira_config (
  chave text primary key,
  valor jsonb
);

-- Segurança: ninguém acessa pelo navegador; só a função da Netlify (com a service role key).
alter table esteira_usuarios enable row level security;
alter table esteira_criativos enable row level security;
alter table esteira_listas enable row level security;
alter table esteira_config enable row level security;

insert into esteira_usuarios (id, nome, pin, papel) values
  ('joao', 'João Guerra', '1111', 'operador'),
  ('jeff', 'Jeff Figueredo', '2222', 'operador'),
  ('kaian', 'Kaian', '0000', 'admin')
on conflict (id) do nothing;

insert into esteira_listas (tipo, valor) values
  ('nicho', 'Psicologia / Terapia'), ('nicho', 'Espiritualidade / Holístico'), ('nicho', 'Relacionamento'),
  ('nicho', 'Desenvolvimento pessoal'), ('nicho', 'Saúde / Emagrecimento'), ('nicho', 'Renda extra'), ('nicho', 'Outro')
on conflict do nothing;

insert into esteira_config (chave, valor) values
  ('metaDiaria', '20'), ('horarioLimite', '"16:00"'), ('fuso', '"America/Sao_Paulo"'), ('modelo', '"claude-sonnet-5-5"')
on conflict (chave) do nothing;

-- ============================================================ Ofertas (Mineração e Modelagem)
-- Uma ficha por oferta (OF-0001). A mesma ficha nasce na caixa e segue até a manutenção.

create sequence if not exists esteira_oferta_numero_seq;

create or replace function esteira_proxima_oferta() returns bigint
language sql as $$ select nextval('esteira_oferta_numero_seq') $$;

create table if not exists esteira_ofertas (
  id text primary key,
  numero bigint unique not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por text references esteira_usuarios(id),
  criado_por_nome text,
  frase text not null,
  notas text,
  origem text not null,
  link text,
  mae_link text,
  mae_id text,
  nicho text,
  ticket numeric,
  anunciantes int,
  classe text check (classe in ('A', 'B', 'C', 'D')),
  score int,
  status text not null default 'caixa',
  monitorar_ate date,
  motivo_descarte text,
  teimosia boolean not null default false,
  trilha text check (trilha in ('oferta_nova', 'mecanismo', 'lateralizacao')),
  idioma text,
  cacador jsonb,
  etapas jsonb not null default '{}'::jsonb,
  checklist jsonb not null default '{}'::jsonb,
  teste jsonb,
  funil jsonb,
  escalou text check (escalou in ('sim', 'nao')),
  historico jsonb not null default '[]'::jsonb
);
create index if not exists esteira_ofertas_status_idx on esteira_ofertas (status);
create unique index if not exists esteira_ofertas_cacador_idx on esteira_ofertas ((cacador->>'chave')) where cacador is not null;

alter table esteira_ofertas enable row level security;

-- Dias que o anúncio estava ativo na Biblioteca quando entrou no Swipe (mostra se o criativo é validado).
alter table esteira_criativos add column if not exists dias_ativos int;

-- ================================================================ App Testes (A/B de páginas)
create sequence if not exists esteira_teste_numero_seq;
create or replace function esteira_proximo_teste() returns bigint language sql as $$ select nextval('esteira_teste_numero_seq') $$;

create table if not exists esteira_testes (
  id text primary key,
  numero bigint,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por text,
  nome text not null,
  oferta_id text,
  host text not null,
  status text not null default 'rascunho',      -- rascunho, ativo, pausado, encerrado
  variantes jsonb not null default '[]',         -- [{id:'a', nome, arquivo:'/', peso:50}]
  inicio timestamptz,
  fim timestamptz,
  vencedora text,
  gasto jsonb,                                   -- {total, em, por}
  produtos jsonb not null default '[]',          -- IDs de produto da Lastlink aprendidos nas vendas
  notas text,
  historico jsonb not null default '[]'
);
create index if not exists esteira_testes_host on esteira_testes (host, status);

-- Visitas únicas e cliques no checkout, por dia e página.
create table if not exists esteira_testes_contagem (
  teste_id text not null,
  dia date not null,
  variante text not null,
  visitas int not null default 0,
  ics int not null default 0,
  primary key (teste_id, dia, variante)
);
create or replace function esteira_teste_contar(p_teste text, p_variante text, p_tipo text) returns void language sql as $$
  insert into esteira_testes_contagem (teste_id, dia, variante, visitas, ics)
  values (p_teste, (now() at time zone 'America/Sao_Paulo')::date, p_variante,
          case when p_tipo = 'visita' then 1 else 0 end, case when p_tipo = 'ic' then 1 else 0 end)
  on conflict (teste_id, dia, variante) do update
    set visitas = esteira_testes_contagem.visitas + excluded.visitas,
        ics = esteira_testes_contagem.ics + excluded.ics
$$;

-- ID do visitante da Stape (cookie "index", que vai no sck) ligado à página que ele viu.
create table if not exists esteira_testes_visitantes (
  teste_id text not null,
  visitante text not null,
  variante text not null,
  criado_em timestamptz not null default now(),
  primary key (teste_id, visitante)
);
create index if not exists esteira_testes_visitantes_v on esteira_testes_visitantes (visitante);

-- Vendas da Lastlink (sem dados do comprador).
create table if not exists esteira_testes_vendas (
  id text primary key,                           -- PaymentId da Lastlink
  teste_id text,
  variante text,
  via text,                                      -- vtid ou sck
  evento text,
  valor numeric,
  produto_id text,
  produto text,
  oferta_lastlink text,
  upsell boolean not null default false,
  reembolso boolean not null default false,
  is_test boolean not null default false,
  utm_content text,
  pago_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists esteira_testes_vendas_t on esteira_testes_vendas (teste_id);

-- Registro de cada envio do webhook, para conferir que está chegando.
create table if not exists esteira_testes_webhooks (
  id bigserial primary key,
  recebido_em timestamptz not null default now(),
  evento text, is_test boolean, pagamento text, teste_id text, variante text, via text,
  vtid text, tem_sck boolean, valor numeric, produto text, resultado text
);

alter table esteira_testes enable row level security;
alter table esteira_testes_contagem enable row level security;
alter table esteira_testes_visitantes enable row level security;
alter table esteira_testes_vendas enable row level security;
alter table esteira_testes_webhooks enable row level security;

-- ================================================================ App Criativos (Setor de Criativos)
-- Uma linha por criativo (ID = nome do anúncio no Meta, ex.: CFAM-L4-UGC-05). Métricas vêm da Meta
-- Marketing API (gasto, cliques, vídeo) e as vendas do webhook da Lastlink (utm_content = ID do criativo).

create table if not exists esteira_cr_ofertas (
  id text primary key,                            -- slug curto, igual ao prefixo dos anúncios: CFAM, KSN, RADICIG
  nome text not null,
  familia text,                                   -- Constelação, Nervo Vago, Radiestesia, Arteterapia…
  estado text not null default 'validacao' check (estado in ('validacao', 'escalando', 'em_risco', 'pausada', 'encerrada')),
  mix jsonb not null default '{"modelagem":60,"variacao":30,"zero":10}'::jsonb,
  prefixos jsonb not null default '[]'::jsonb,    -- outros prefixos de anúncio que pertencem à oferta (ex.: ["CIGA","RADI-CIG"])
  produtos jsonb not null default '[]'::jsonb,    -- nomes/IDs de produto da Lastlink que contam como venda desta oferta
  pasta_drive text,
  pv_url text,
  notas text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists esteira_cr_levas (
  id text primary key,                            -- CFAM-L4
  oferta_id text not null references esteira_cr_ofertas(id),
  numero int not null,
  planejada date,
  no_ar date,
  hipotese text,                                  -- o que esta leva testa (ângulo, formato, público)
  status text not null default 'planejada' check (status in ('planejada', 'producao', 'no_ar', 'encerrada')),
  criado_em timestamptz not null default now(),
  unique (oferta_id, numero)
);

create table if not exists esteira_cr_criativos (
  id text primary key,                            -- nome do anúncio no Meta
  oferta_id text not null references esteira_cr_ofertas(id),
  leva_id text references esteira_cr_levas(id),
  tipo text not null default 'modelagem' check (tipo in ('modelagem', 'variacao', 'zero')),
  pai_id text,                                    -- criativo que serviu de base
  formato text,                                   -- IMG, VID, UGC, CAR
  angulo text,
  mecanismo text,
  hook text,
  body text,
  copy text,                                      -- texto do anúncio / roteiro
  arquivo_url text,                               -- link do arquivo (Drive)
  status text not null default 'fila' check (status in ('fila', 'briefing', 'producao', 'revisao', 'aprovado', 'no_ar', 'meio', 'vencedor', 'fadiga', 'morto')),
  status_em timestamptz not null default now(),
  no_ar_em timestamptz,                           -- primeira vez que entrou no ar
  score int,                                      -- nota do revisor (0 a 10)
  aprendizado text,                               -- 1 linha: o que este criativo ensinou
  historico jsonb not null default '[]'::jsonb,   -- [{em, de, para, por, nota}]
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists esteira_cr_criativos_oferta on esteira_cr_criativos (oferta_id, status);
create index if not exists esteira_cr_criativos_leva on esteira_cr_criativos (leva_id);

-- Anúncios do Meta encontrados no sync, ligados ao criativo pelo nome.
create table if not exists esteira_cr_ads (
  ad_id text primary key,
  conta_id text not null,
  ad_name text not null,
  adset_id text, adset_name text,
  campaign_id text, campaign_name text,
  criativo_id text,                               -- null = anúncio sem criativo cadastrado (aparece em "sem par")
  status text,
  criado_em_meta timestamptz,
  sync_em timestamptz not null default now()
);
create index if not exists esteira_cr_ads_criativo on esteira_cr_ads (criativo_id);

-- Métricas diárias por anúncio (um criativo pode rodar em vários anúncios/contas).
create table if not exists esteira_cr_metricas (
  ad_id text not null,
  dia date not null,
  criativo_id text,
  gasto numeric not null default 0,
  impressoes int not null default 0,
  cliques int not null default 0,
  lpv int not null default 0,
  ic int not null default 0,
  video_views int not null default 0,
  video_3s int not null default 0,
  video_75 int not null default 0,
  primary key (ad_id, dia)
);
create index if not exists esteira_cr_metricas_criativo on esteira_cr_metricas (criativo_id, dia);

-- Vendas (webhook da Lastlink ou importação), sem dados do comprador.
create table if not exists esteira_cr_vendas (
  id text primary key,                            -- PaymentId da Lastlink (ou LL-<id> na importação)
  criativo_id text,
  oferta_id text,
  utm_content text,
  utm_campaign text,
  valor numeric,
  produto text,
  pago_em timestamptz,
  reembolso boolean not null default false,
  is_test boolean not null default false,
  origem text not null default 'webhook',         -- webhook | importacao
  criado_em timestamptz not null default now()
);
create index if not exists esteira_cr_vendas_criativo on esteira_cr_vendas (criativo_id, pago_em);
create index if not exists esteira_cr_vendas_dia on esteira_cr_vendas (pago_em);

-- O que a operação aprendeu: vereditos, dissecações, hipóteses, notas (de agente ou de pessoa).
create table if not exists esteira_cr_aprendizados (
  id bigserial primary key,
  oferta_id text,
  leva_id text,
  criativo_id text,
  tipo text not null check (tipo in ('veredito', 'dissecacao', 'hipotese', 'nota')),
  texto text not null,
  autor text not null default 'sistema',
  criado_em timestamptz not null default now()
);
create index if not exists esteira_cr_aprendizados_oferta on esteira_cr_aprendizados (oferta_id, criado_em desc);

-- Registro de cada envio do webhook e de cada sync (para conferir que está chegando).
create table if not exists esteira_cr_log (
  id bigserial primary key,
  em timestamptz not null default now(),
  tipo text not null,                             -- webhook | sync | veredito | importacao
  resumo text,
  detalhe jsonb
);

alter table esteira_cr_ofertas enable row level security;
alter table esteira_cr_levas enable row level security;
alter table esteira_cr_criativos enable row level security;
alter table esteira_cr_ads enable row level security;
alter table esteira_cr_metricas enable row level security;
alter table esteira_cr_vendas enable row level security;
alter table esteira_cr_aprendizados enable row level security;
alter table esteira_cr_log enable row level security;

-- Agregado por criativo (tudo que o Board, a Tabela e o motor de veredito precisam), calculado no banco.
create or replace function esteira_cr_resumo(p_desde date default null)
returns table (
  criativo_id text, gasto numeric, impressoes bigint, cliques bigint, lpv bigint, ic bigint,
  video_views bigint, video_3s bigint, video_75 bigint, vendas bigint, receita numeric, reembolsos bigint,
  primeiro_dia date, ultimo_dia date
) language sql stable as $$
  with m as (
    select criativo_id, sum(gasto) gasto, sum(impressoes) impressoes, sum(cliques) cliques, sum(lpv) lpv, sum(ic) ic,
           sum(video_views) video_views, sum(video_3s) video_3s, sum(video_75) video_75, min(dia) primeiro_dia, max(dia) ultimo_dia
    from esteira_cr_metricas where criativo_id is not null and (p_desde is null or dia >= p_desde) group by criativo_id
  ), v as (
    select criativo_id, count(*) filter (where not reembolso and not is_test) vendas,
           coalesce(sum(valor) filter (where not reembolso and not is_test), 0) receita,
           count(*) filter (where reembolso) reembolsos
    from esteira_cr_vendas where criativo_id is not null and (p_desde is null or pago_em::date >= p_desde) group by criativo_id
  )
  select coalesce(m.criativo_id, v.criativo_id), coalesce(m.gasto, 0), coalesce(m.impressoes, 0), coalesce(m.cliques, 0), coalesce(m.lpv, 0), coalesce(m.ic, 0),
         coalesce(m.video_views, 0), coalesce(m.video_3s, 0), coalesce(m.video_75, 0), coalesce(v.vendas, 0), coalesce(v.receita, 0), coalesce(v.reembolsos, 0),
         m.primeiro_dia, m.ultimo_dia
  from m full join v on v.criativo_id = m.criativo_id
$$;

insert into esteira_config (chave, valor) values
  ('cr_regras', '{"gastoMin":150,"vendasMin":5,"roasSegue":1.3,"roasMorre":1.0,"vencedorVendas":20,"fadigaQueda":0.3,"filhos":3,"horasVeredito":72,"diasRisco":14}'),
  ('cr_contas', '[]')
on conflict (chave) do nothing;

-- ---------------------------------------------------------------- Biblioteca de copy (fusão com o Controle de Levas)
-- Fichas de estudo do REPERTORIO (Schwartz, Great Leads, Caples, Sugarman, Cashvertising, Arthur, Matheus…) + índice e vocabulário.
-- O Diretor de Copy lê a pesquisa da oferta e 2–3 fichas antes de escrever cada card.
create table if not exists esteira_cr_biblioteca (
  id text primary key,                 -- nome do arquivo sem .md (ex.: lead-body--great-leads)
  categoria text,                      -- angulo | formato | headline | hook | lead-body | mecanismo | oferta | oficio | pesquisa | prova-crenca | psicologia | guia
  titulo text,
  fonte text,
  peso text,                           -- essencial | complementar
  consulte_quando text,
  drive_id text,
  texto text not null,
  atualizado_em timestamptz default now()
);
alter table esteira_cr_biblioteca enable row level security;

alter table esteira_cr_ofertas add column if not exists pesquisa text;            -- pesquisa de público/formato (texto bruto, vindo do Drive)
alter table esteira_cr_ofertas add column if not exists pesquisa_resumo text;     -- 6 camadas destiladas pela IA (é o que o Copy lê)
alter table esteira_cr_ofertas add column if not exists pesquisa_drive jsonb default '[]';  -- ids dos arquivos no Drive
alter table esteira_cr_ofertas add column if not exists teto_ic numeric;          -- teto de custo por IC (USD) da família, regra de corte do João
alter table esteira_cr_levas add column if not exists codigo text;                -- id_leva do Controle de Levas (OFERTA-IMG/VID-AAAAMMDD)
alter table esteira_cr_criativos add column if not exists base_pesquisa text;     -- "Base na pesquisa" do card: público, dor/desejo, crença/objeção, expressões usadas
alter table esteira_cr_criativos add column if not exists fichas jsonb default '[]';        -- fichas do repertório consultadas
alter table esteira_cr_criativos add column if not exists marcacoes jsonb default '{}';     -- marcações visuais do Editor: formato_hook, primeiro_frame, legenda, duracao_s, cortes_por_10s, produto_aparece_em_s, avatar

-- ---------------------------------------------------------------- Diretor de Criação: banco de takes + projeto de edição
-- Takes = imagens/vídeos gerados por nós (ChatGPT/Grok/Magnific) reaproveitáveis dentro da oferta (espelho do _TAKES.md da CLAUDE-EDITOR).
create table if not exists esteira_cr_takes (
  id text primary key,                   -- OFERTA/arquivo (ex.: RADICIG/grok_T02_pendulo.mp4)
  oferta_id text references esteira_cr_ofertas(id),
  arquivo text not null,
  tipo text default 'video',             -- imagem | video | arte | pagina
  ferramenta text,                       -- Grok | ChatGPT | Magnific | código | PDF
  descricao text,                        -- o que mostra
  bom_para text,                         -- hook dor / mecanismo / produto…
  usado_em jsonb default '[]',           -- ids de criativos / hooks
  prompt text,                           -- prompt de imagem usado
  prompt_animacao text,                  -- prompt de animação (Grok, inglês)
  arquivo_url text,                      -- link (Drive) ou URL gerada (Magnific)
  tarefa jsonb,                          -- geração em andamento (Magnific): {id, status}
  rejeitado boolean default false,
  motivo text,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);
alter table esteira_cr_takes enable row level security;
create index if not exists esteira_cr_takes_oferta on esteira_cr_takes (oferta_id);

alter table esteira_cr_criativos add column if not exists projeto jsonb;          -- saída do Diretor de Criação (demanda, roteiro, hooks, takes)
alter table esteira_cr_criativos add column if not exists projeto_em timestamptz;
alter table esteira_cr_criativos add column if not exists entrega jsonb;          -- o que o Editor devolveu (arquivos, hooks entregues, takes usados)

-- ---------------------------------------------------------------- Rastreabilidade da leva ("por que esta leva?")
alter table esteira_cr_criativos add column if not exists variavel text;   -- o que este card testa em relação ao pai: hook_visual | hook_falado | body | formato | angulo | avatar | mecanismo | oferta | execucao
alter table esteira_cr_criativos add column if not exists hipotese text;   -- título da hipótese do Analista que o card testa
alter table esteira_cr_criativos add column if not exists muda text;       -- "o que muda" em 1–2 frases (escrito pelo Copy)
alter table esteira_cr_levas add column if not exists veredito text;       -- veredito do Analista que originou a leva
alter table esteira_cr_levas add column if not exists hipoteses jsonb default '[]';  -- [{titulo, porque, tipo, pai, variavel, ja_testado}]
alter table esteira_cr_ofertas add column if not exists meta_semanal integer;  -- criativos novos por semana (padrão: regras.metaSemanal = 60)
