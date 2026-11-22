// A cada hora (minuto 25), das 06h às 22h de Brasília: acorda o Diretor de Copy (cards na fila) e o Diretor de Criação (aprovados sem projeto).
import crypto from 'node:crypto';
import { contextoInterno } from '../../lib/api.mjs';

export default async () => {
  const { sb } = contextoInterno();
  const chave = crypto.createHmac('sha256', process.env.APP_SECRET || '').update('lastlink-criativos').digest('base64url').slice(0, 32);
  const site = process.env.URL || 'https://esteiramineracao.netlify.app';
  const fila = await sb('esteira_cr_criativos?status=eq.fila&select=id&limit=1');
  if (fila.length) await fetch(`${site}/cr-copy-bg`, { method: 'POST', headers: { 'x-cr-chave': chave } }).then((r) => console.log('copy', r.status)).catch((e) => console.error(e));
  // Diretor de Criação: cards aprovados que ainda não têm projeto de edição.
  const semProjeto = await sb('esteira_cr_criativos?status=eq.aprovado&projeto=is.null&copy=not.is.null&select=id&limit=1');
  if (semProjeto.length) await fetch(`${site}/cr-criacao-bg`, { method: 'POST', headers: { 'x-cr-chave': chave, 'content-type': 'application/json' }, body: '{}' }).then((r) => console.log('criacao', r.status)).catch((e) => console.error(e));
};

export const config = { schedule: '25 9-23,0-1 * * *' };
