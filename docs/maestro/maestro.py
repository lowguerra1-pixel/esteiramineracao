#!/usr/bin/env python3
"""
maestro.py — mãos do Maestro no app Criativos (https://esteiramineracao.netlify.app).

  python maestro.py estado                       → visão geral: ofertas, esteira, alertas, gasto de IA, últimas decisões
  python maestro.py oferta RADICIG               → uma oferta a fundo: vencedores, 7d, esteira, notas, decisões
  python maestro.py alertas                      → só os alertas (não subiu, revisão parada, queimando, teto, sync)
  python maestro.py briefing                     → texto curto do dia (base da mensagem diária)
  python maestro.py regras                       → regras vivas do veredito, níveis e mix
  python maestro.py regras set roasSegue=1.5 vencedorVendas=20 diasRisco=10
  python maestro.py regras set niveis='[{"nome":"ouro","roas":3,"hookVisual":6,"hookFalado":6,"body":3}]'
  python maestro.py config set tetoDiarioUSD=8 criacaoAdiantada=10
  python maestro.py decidir "texto" [--oferta SIGLA]   → grava uma DECISÃO (entra no contexto do Analista e do Copy)
  python maestro.py aprendizado "texto" [--oferta SIGLA]
  python maestro.py decisoes                     → lista as decisões registradas
  python maestro.py fila | revisao | aprovados [SIGLA]
  python maestro.py aprovar ID | devolver ID "nota" | matar ID "motivo"
  python maestro.py arvore PAI --hv 5 --hf 3 --b 2   → abre filhos de um vencedor (quantidades manuais)
  python maestro.py rodar copy|criacao|analista|veredito|sync
  python maestro.py uso                          → gasto de IA hoje / 7d / 30d por agente
  python maestro.py oferta-set RADICIG pvUrl=https://... notas="..." metaSemanal=60

Acesso: variável ESTEIRA_CHAVE (chave ek_… criada pelo gestor em /api/cr/chaves) ou ~/.esteira-maestro.json {"chave": "ek_..."}.
Alternativa: ESTEIRA_USUARIO + ESTEIRA_PIN (login normal).
"""
import json, os, sys, pathlib, urllib.request, urllib.parse

SITE = os.environ.get('ESTEIRA_URL', 'https://esteiramineracao.netlify.app')
_TOKEN = None


def _token():
    global _TOKEN
    if _TOKEN: return _TOKEN
    k = os.environ.get('ESTEIRA_CHAVE')
    if not k:
        f = pathlib.Path.home() / '.esteira-maestro.json'
        if f.exists(): k = json.loads(f.read_text(encoding='utf-8')).get('chave')
    if k: _TOKEN = k; return k
    u, p = os.environ.get('ESTEIRA_USUARIO'), os.environ.get('ESTEIRA_PIN')
    if u and p:
        r = urllib.request.urlopen(urllib.request.Request(f'{SITE}/api/login', data=json.dumps({'id': u, 'pin': p}).encode(), headers={'content-type': 'application/json'}, method='POST'))
        _TOKEN = json.load(r)['token']; return _TOKEN
    sys.exit('Sem acesso: defina ESTEIRA_CHAVE (ou ~/.esteira-maestro.json) ou ESTEIRA_USUARIO/ESTEIRA_PIN.')


def api(path, method='GET', body=None):
    req = urllib.request.Request(f'{SITE}{path}', data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={'authorization': f'Bearer {_token()}', 'content-type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f'{method} {path} → {e.code}: {e.read().decode()[:300]}')


def f(x, d=2):
    return '-' if x is None else f'{x:.{d}f}'


# ---------------------------------------------------------------- leitura
def estado():
    e = api('/api/cr/maestro/estado')
    print(f"ESTADO · {e['agora'][:16]}Z · gasto IA hoje US$ {e['uso']['total']} / teto {e['uso']['teto']} ({e['uso']['chamadas']} chamadas)")
    print('\nOFERTAS (7 dias):')
    for o in e['painel']['porOferta']:
        es = e['esteira'].get(o['id'], {})
        print(f"  {o['id']:9} {o.get('estado', ''):10} receita R$ {f(o.get('receita7'), 0):>7} (ant. {f(o.get('receitaSemanaAnterior'), 0)}) gasto R$ {f(o.get('gasto7'), 0):>6} ROAS {f(o.get('roas7'))} · vencedores {o.get('vencedores', 0)} · no ar {o.get('rodando', 0)}"
              f" · fila {es.get('fila', 0)} escrev {es.get('escrevendo', 0)} rev {es.get('revisao', 0)} aprov {es.get('aprovado', 0)} (s/proj {es.get('semProjeto', 0)}) edit {es.get('editando', 0)} prontos {es.get('prontosParaSubir', 0)}")
    if e['alertas']:
        print('\nALERTAS:')
        for a in e['alertas']: print(f"  [{a['tipo']}] {a['msg']}")
    if e['decisoes']:
        print('\nÚLTIMAS DECISÕES:')
        for d in e['decisoes'][:6]: print(f"  {d['criado_em'][:10]} [{d.get('oferta_id') or 'todas'}] {d['texto'][:160]}")
    print('\nVEREDITOS RECENTES:')
    for v in e['vereditosRecentes'][:12]: print(f"  {v['em'][:10]} {v['oferta']:8} {v['criativo'] or '':40} {v['texto'][:110]}")
    print('\nREGRAS:', {k: e['regras'][k] for k in ('roasSegue', 'roasMorre', 'vencedorVendas', 'gastoMin', 'vendasMin', 'horasVeredito', 'fadigaQueda', 'diasRisco', 'metaSemanal') if k in e['regras']})


def oferta(sigla):
    e = api('/api/cr/maestro/estado')
    o = next((x for x in e['painel']['porOferta'] if x['id'] == sigla), None) or sys.exit(f'oferta {sigla} não encontrada')
    meta = next((x for x in e['ofertas'] if x['id'] == sigla), {})
    print(f"{sigla} — {meta.get('nome')} · estado {meta.get('estado')} · ROAS 7d {f(o.get('roas7'))} · receita 7d R$ {f(o.get('receita7'), 0)} (ant. {f(o.get('receitaSemanaAnterior'), 0)}) · gasto R$ {f(o.get('gasto7'), 0)} · pesquisa {'sim' if meta.get('temPesquisa') else 'NÃO'}")
    print('\nESTEIRA:', e['esteira'].get(sigla))
    print('\nVENCEDORES / FADIGA / MEIO:')
    for c in sorted([c for c in e['vencedores'] if c['oferta'] == sigla], key=lambda c: -(c['d7'] or {}).get('gasto', 0)):
        t, d = c['total'] or {}, c['d7'] or {}
        print(f"  {c['id']:42} {c['status']:8} total g{f(t.get('gasto'), 0)} v{t.get('vendas', 0)} r{f(t.get('roas'))} | 7d g{f(d.get('gasto'), 0)} v{d.get('vendas', 0)} r{f(d.get('roas'))} hook{f(d.get('hookRate'), 0)}")
    print('\nLEVAS ABERTAS:', [l['id'] + ' ' + l['status'] for l in e['levas'] if l['ofertaId'] == sigla])
    print('\nANALISTA (último):')
    for a in e['analistaRecente']:
        if a['oferta_id'] == sigla: print('  ', a['criado_em'][:10], a['texto'][:600]); break
    print('\nDECISÕES:')
    for d in e['decisoes']:
        if d.get('oferta_id') in (None, sigla): print(f"  {d['criado_em'][:10]} [{d.get('oferta_id') or 'todas'}] {d['texto'][:200]}")
    if meta.get('notas'): print('\nNOTAS DA OFERTA:\n', meta['notas'][:1500])


def alertas():
    e = api('/api/cr/maestro/estado')
    for a in e['alertas']: print(f"[{a['tipo']}] {a['msg']}")
    if not e['alertas']: print('sem alertas')


def briefing():
    e = api('/api/cr/maestro/estado')
    tot = sum((o.get('receita7') or 0) for o in e['painel']['porOferta'])
    ant = sum((o.get('receitaSemanaAnterior') or 0) for o in e['painel']['porOferta'])
    print(f"RECEITA 7d: R$ {tot:,.0f} (semana anterior R$ {ant:,.0f})")
    for o in e['painel']['porOferta']:
        if (o.get('gasto7') or 0) > 0 or (o.get('receita7') or 0) > 0:
            print(f"- {o['id']}: ROAS {f(o.get('roas7'))}, R$ {f(o.get('receita7'), 0)} receita / R$ {f(o.get('gasto7'), 0)} gasto, {o.get('vencedores', 0)} vencedores, {o.get('rodando', 0)} no ar")
    es = e['esteira']; tot_es = {k: sum(v[k] for v in es.values()) for k in ('fila', 'revisao', 'aprovado', 'semProjeto', 'editando', 'prontosParaSubir')}
    print(f"ESTEIRA: {tot_es['fila']} na fila, {tot_es['revisao']} em revisão, {tot_es['aprovado']} aprovados ({tot_es['semProjeto']} sem projeto), {tot_es['editando']} editando, {tot_es['prontosParaSubir']} prontos pra subir")
    print(f"IA: US$ {e['uso']['total']} hoje (teto {e['uso']['teto']})")
    print('VEREDITOS 24h:')
    from datetime import datetime, timedelta, timezone
    lim = (datetime.now(timezone.utc) - timedelta(hours=26)).isoformat()
    for v in e['vereditosRecentes']:
        if v['em'] > lim: print(f"  {v['oferta']} {v['criativo'] or ''}: {v['texto'][:120]}")
    print('ALERTAS:')
    for a in e['alertas']: print(f"  [{a['tipo']}] {a['msg']}")


def regras(args):
    if args[:1] == ['set']:
        patch = {}
        for kv in args[1:]:
            k, v = kv.split('=', 1)
            try: patch[k] = json.loads(v)
            except json.JSONDecodeError: patch[k] = v
        print(api('/api/cr/config', 'POST', {'regras': patch}))
    else:
        print(json.dumps(api('/api/cr/bootstrap')['regras'], ensure_ascii=False, indent=1))


def config_set(args):
    patch = {}
    for kv in args:
        k, v = kv.split('=', 1)
        try: patch[k] = json.loads(v)
        except json.JSONDecodeError: patch[k] = v
    print(api('/api/cr/config', 'POST', patch))


def decidir(texto, oferta=None, tipo='decisao'):
    print(api('/api/cr/aprendizados', 'POST', {'texto': texto, 'tipo': tipo, 'ofertaId': oferta}))


def decisoes():
    for d in api('/api/cr/maestro/estado')['decisoes']:
        print(f"{d['id']:>5} {d['criado_em'][:10]} [{d.get('oferta_id') or 'todas'}] ({d['autor']}) {d['texto']}")


def listar(status, sigla=None):
    b = api('/api/cr/bootstrap')
    for c in b['criativos']:
        if c['status'] == status and (not sigla or c['ofertaId'] == sigla):
            print(f"{c['id']:44} {c['ofertaId']:8} {c.get('variavel') or '':12} nota {c.get('score') or '-'} pai {c.get('paiId') or '-'}\n    {(c.get('hook') or c.get('hipotese') or '')[:140]}")


def status(cid, para, nota=None):
    print(api(f'/api/cr/criativos/{urllib.parse.quote(cid)}/status', 'POST', {'para': para, 'nota': nota}))


def arvore(pai, hv=0, hf=0, b=0):
    print(api(f'/api/cr/criativos/{urllib.parse.quote(pai)}/arvore', 'POST', {'hookVisual': hv, 'hookFalado': hf, 'body': b}))


def rodar(agente):
    rota = {'copy': '/api/cr/copy', 'criacao': '/api/cr/criacao', 'analista': '/api/cr/analista', 'veredito': '/api/cr/veredito', 'sync': '/api/cr/sync'}[agente]
    print(api(rota, 'POST', {}))


def uso():
    u = api('/api/cr/uso')
    print(f"hoje US$ {u['hoje']['total']} ({u['hoje']['chamadas']} chamadas) teto {u['teto']} · 7d US$ {u['d7']['total']} · 30d US$ {u['d30']['total']}")
    print('por agente hoje:', u['hoje']['por']); print('por agente 7d:', u['d7']['por']); print('por dia:', u['porDia'])


def oferta_set(sigla, args):
    patch = {}
    for kv in args:
        k, v = kv.split('=', 1)
        try: patch[k] = json.loads(v)
        except json.JSONDecodeError: patch[k] = v
    print(api(f'/api/cr/ofertas/{sigla}', 'PATCH', patch))


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: print(__doc__); sys.exit()
    cmd = a[0]
    opt = {a[i]: a[i + 1] for i in range(len(a) - 1) if a[i].startswith('--')}
    pos = [x for i, x in enumerate(a[1:], 1) if not x.startswith('--') and not a[i - 1].startswith('--')]
    if cmd == 'estado': estado()
    elif cmd == 'oferta': oferta(pos[0])
    elif cmd == 'alertas': alertas()
    elif cmd == 'briefing': briefing()
    elif cmd == 'regras': regras(a[1:])
    elif cmd == 'config' and a[1:2] == ['set']: config_set(a[2:])
    elif cmd == 'decidir': decidir(pos[0], opt.get('--oferta'))
    elif cmd == 'aprendizado': decidir(pos[0], opt.get('--oferta'), 'nota')
    elif cmd == 'decisoes': decisoes()
    elif cmd in ('fila', 'revisao', 'aprovados'): listar({'fila': 'fila', 'revisao': 'revisao', 'aprovados': 'aprovado'}[cmd], pos[0] if pos else None)
    elif cmd == 'aprovar': status(pos[0], 'aprovado', 'aprovado pelo Maestro')
    elif cmd == 'devolver': status(pos[0], 'briefing', pos[1] if len(pos) > 1 else 'devolvido pelo Maestro')
    elif cmd == 'matar': status(pos[0], 'morto', pos[1] if len(pos) > 1 else 'morto pelo Maestro')
    elif cmd == 'arvore': arvore(pos[0], int(opt.get('--hv', 0)), int(opt.get('--hf', 0)), int(opt.get('--b', 0)))
    elif cmd == 'rodar': rodar(pos[0])
    elif cmd == 'uso': uso()
    elif cmd == 'oferta-set': oferta_set(pos[0], a[3:])
    else: print(__doc__)
