#!/usr/bin/env python3
"""
pedidos.py — ponte entre o app Criativos (API) e a oficina CLAUDE-EDITOR.
Copie para CLAUDE-EDITOR/_SISTEMA/engine/pedidos.py.

  python pedidos.py listar                      → cards aprovados/em produção com projeto (a "fila do Editor")
  python pedidos.py baixar <CODIGO>             → cria PROJETOS/<CODIGO>/ com demanda.md, copy.txt, leva.json, planos/_roteiro.json, takes.md
                                                  e marca o card como "em produção"
  python pedidos.py entregar <CODIGO> <pasta>   → registra a entrega (arquivos da pasta, hooks, takes usados) e as marcações do leva.json
  python pedidos.py prontos [arquivo.csv]       → cards ENTREGUES pelo Editor esperando subir no Meta (a "fila do Subidor");
                                                  com arquivo.csv, grava a planilha de subida (nome do anúncio, arquivo, pasta, copy, UTM)
  python pedidos.py takes <SIGLA>               → lista o banco de takes da oferta
  python pedidos.py take-ok <ID> <url>          → grava o link/arquivo de um take gerado
  python pedidos.py take-x <ID> "motivo"        → marca take rejeitado

Login: variáveis ESTEIRA_USUARIO e ESTEIRA_PIN (ou ~/.esteira.json com {"usuario": "...", "pin": "..."}).
"""
import json, os, sys, pathlib, urllib.request

SITE = os.environ.get('ESTEIRA_URL', 'https://esteiramineracao.netlify.app')
RAIZ = pathlib.Path(os.environ.get('CLAUDE_EDITOR', pathlib.Path(__file__).resolve().parents[2]))


def _cred():
    u, p = os.environ.get('ESTEIRA_USUARIO'), os.environ.get('ESTEIRA_PIN')
    if not (u and p):
        f = pathlib.Path.home() / '.esteira.json'
        if f.exists():
            d = json.loads(f.read_text(encoding='utf-8')); u, p = d.get('usuario'), d.get('pin')
    if not (u and p):
        sys.exit('Defina ESTEIRA_USUARIO e ESTEIRA_PIN (ou ~/.esteira.json).')
    return u, p


_TOKEN = None


def api(path, method='GET', body=None):
    global _TOKEN
    if _TOKEN is None:
        u, p = _cred()
        r = urllib.request.urlopen(urllib.request.Request(f'{SITE}/api/login', data=json.dumps({'id': u, 'pin': p}).encode(), headers={'content-type': 'application/json'}, method='POST'))
        _TOKEN = json.load(r)['token']
    req = urllib.request.Request(f'{SITE}{path}', data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={'authorization': f'Bearer {_TOKEN}', 'content-type': 'application/json'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def listar():
    for c in api('/api/cr/producao'):
        p = c.get('projeto') or {}
        print(f"{c['id']:40} {c['status']:9} {c.get('formato') or '':4} hooks {len(p.get('hooks', []))} takes novos {len(p.get('takes_novos', []))} {'(sem projeto ainda)' if not p else ''}")


def prontos(csv_path=None):
    import csv
    linhas = []
    for c in api('/api/cr/producao'):
        e = c.get('entrega')
        if c['status'] != 'producao' or not e:
            continue
        nome = c['id'].replace(' - ', '-').replace(' ', '-')
        arquivos = [a if isinstance(a, str) else (a.get('nome') or a.get('arquivo') or '') for a in e.get('arquivos', [])]
        of = c.get('oferta') or {}
        linhas.append({
            'nome_anuncio': nome, 'arquivo': ' | '.join(arquivos), 'pasta': e.get('pasta') or '',
            'oferta': c['ofertaId'], 'pai': c.get('paiId') or '', 'variavel': c.get('variavel') or '', 'formato': c.get('formato') or '',
            'texto_primario': (c.get('copy') or '').split('\n\nHEADLINE:')[0].strip(),
            'headline': ((c.get('copy') or '').split('HEADLINE:')[1].split('\n')[0].strip() if 'HEADLINE:' in (c.get('copy') or '') else ''),
            'pv_url': of.get('pvUrl') or '', 'utm_content': nome + '|{{ad.id}}', 'entregue_em': e.get('em') or '', 'nota_editor': (e.get('nota') or '')[:200],
        })
    for l in linhas:
        print(f"{l['nome_anuncio']:32} {l['variavel']:12} {l['formato']:4} {l['arquivo']}")
    print(f"{len(linhas)} prontos pra subir.")
    if csv_path and linhas:
        with open(csv_path, 'w', newline='', encoding='utf-8-sig') as f:
            w = csv.DictWriter(f, fieldnames=list(linhas[0].keys())); w.writeheader(); w.writerows(linhas)
        print(f'Planilha gravada em {csv_path}')


def baixar(codigo):
    cards = {c['id']: c for c in api('/api/cr/producao')}
    c = cards.get(codigo) or sys.exit(f'{codigo} não está aprovado/em produção.')
    p = c.get('projeto') or sys.exit('Card ainda sem projeto: espere o Diretor de Criação (1–2 min) ou peça ao gestor rodar.')
    oferta = c['ofertaId']
    pasta = RAIZ / oferta / 'PROJETOS' / codigo
    (pasta / 'planos' / 'hooks').mkdir(parents=True, exist_ok=True)
    (pasta / 'demanda.md').write_text(
        f"# DEMANDA — {codigo}\n\n**Oferta:** {oferta}\n**Tipo:** {c['tipo']} · **Formato:** {c.get('formato')}\n**Corte hook/body:** no fim da frase: \"{p.get('corte_hook_body', '')}\"\n\n## Para o editor — leia primeiro\n{p.get('demanda', '')}\n\n## Hook falado\n{c.get('hook') or ''}\n\n## Ângulo / mecanismo\n{c.get('angulo') or ''}\n{c.get('mecanismo') or ''}\n\n## Base na pesquisa\n{c.get('basePesquisa') or ''}\n\n## Por quê\n{p.get('porque', '')}\n", encoding='utf-8')
    (pasta / 'copy.txt').write_text((c.get('copy') or '').split('\n\nHEADLINE:')[0].strip() + '\n', encoding='utf-8')
    leva = {
        'codigo': codigo, 'oferta': oferta, 'data': (c.get('projetoEm') or '')[:10], 'fps': 30,
        'corte_hook_body_frase': p.get('corte_hook_body'), 'corte_hook_body_s': None,
        'hooks': [{'id': h.get('id'), 'codigo_hook': f"{codigo}-{h.get('id', '').split('-')[0]}", 'entrega': f"{codigo}-{h.get('id', '').split('-')[0]}", 'formato': h.get('formato'), 'conceito': h.get('conceito'), 'takes': h.get('takes', []), 'titulo': h.get('titulo')} for h in p.get('hooks', [])],
        'rejeitados': [],
        'registro': {'sigla': oferta, 'leva': c.get('levaId'), 'status': 'Em produção', 'variavel': '', 'body': ''},
        'marcacoes': {'formato_hook': '', 'primeiro_frame': '', 'legenda': '', 'duracao_s': None, 'cortes_por_10s': None, 'produto_aparece_em_s': None, 'avatar': ''},
    }
    (pasta / 'leva.json').write_text(json.dumps(leva, ensure_ascii=False, indent=1), encoding='utf-8')
    (pasta / 'planos' / '_roteiro.json').write_text(json.dumps({'nota': 'Roteiro por frase (sem segundos). Rode editor.py palavras e converta em body.json: cada frase vira um segmento [ini, fim, {type, file/page, z}].', 'roteiro': p.get('roteiro', []), 'imagem': p.get('imagem')}, ensure_ascii=False, indent=1), encoding='utf-8')
    linhas = ['# Takes deste projeto', '', '## Reaproveitar do banco'] + [f'- {t}' for t in p.get('takes_reaproveitados', [])] + ['', '## Gerar (imagem no ChatGPT/Magnific → animar no Grok)']
    for t in p.get('takes_novos', []):
        linhas += [f"### {t.get('id')} → {t.get('arquivo')} ({t.get('tipo')})", t.get('descricao', ''), '', f"Bom para: {t.get('bom_para', '')}", '', 'Prompt de imagem:', t.get('prompt_imagem', ''), '', 'Prompt de animação:', t.get('prompt_animacao', ''), '', f"Produto real anexado: {'sim' if t.get('usa_produto_real') else 'não'}", '']
    (pasta / 'takes.md').write_text('\n'.join(linhas), encoding='utf-8')
    api(f'/api/cr/criativos/{codigo}/producao', 'POST', {})
    print(f'Projeto em {pasta}. Card marcado como em produção.')


def entregar(codigo, pasta):
    pasta = pathlib.Path(pasta)
    arquivos = sorted(f.name for f in pasta.glob('*.mp4')) + sorted(f.name for f in pasta.glob('*.png')) + sorted(f.name for f in pasta.glob('*.jpg'))
    proj = RAIZ / codigo.split('-')[0] / 'PROJETOS' / codigo / 'leva.json'
    leva = json.loads(proj.read_text(encoding='utf-8')) if proj.exists() else {}
    hooks = [{'id': h.get('id'), 'codigoHook': h.get('codigo_hook'), 'entrega': h.get('entrega'), 'formato': h.get('formato'), 'conceito': h.get('conceito')} for h in leva.get('hooks', [])]
    takes = sorted({t for h in leva.get('hooks', []) for t in h.get('takes', [])} | set(leva.get('takes_usados', [])))
    rejeitados = [{'id': r.get('id'), 'take': r.get('take'), 'motivo': r.get('motivo')} for r in leva.get('rejeitados', [])]
    r = api(f'/api/cr/criativos/{codigo}/entrega', 'POST', {'pasta': str(pasta), 'arquivos': arquivos, 'hooks': hooks, 'takesUsados': takes, 'rejeitados': rejeitados, 'marcacoes': leva.get('marcacoes') or None, 'nota': leva.get('registro', {}).get('body') or None})
    print(f"Entrega registrada: {len(arquivos)} arquivo(s), {len(hooks)} hook(s). Status: {r['status']}. Avise para subir na biblioteca do Meta.")


def takes(sigla):
    for t in api(f'/api/cr/takes?oferta={sigla}'):
        print(f"{'X' if t['rejeitado'] else ' '} {t['id']:50} {t['tipo']:6} {t.get('ferramenta') or '':9} {t.get('descricao') or ''}")


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: print(__doc__); sys.exit()
    cmd = a[0]
    if cmd == 'listar': listar()
    elif cmd == 'baixar': baixar(a[1])
    elif cmd == 'entregar': entregar(a[1], a[2])
    elif cmd == 'prontos': prontos(a[1] if len(a) > 1 else None)
    elif cmd == 'takes': takes(a[1])
    elif cmd == 'take-ok': print(api(f'/api/cr/takes/{a[1]}', 'PATCH', {'arquivoUrl': a[2], 'ferramenta': a[3] if len(a) > 3 else 'ChatGPT+Grok'}))
    elif cmd == 'take-x': print(api(f'/api/cr/takes/{a[1]}', 'PATCH', {'rejeitado': True, 'motivo': a[2]}))
    else: print(__doc__)
