// A cada hora (minuto 25), das 06h às 22h de Brasília: acorda o Diretor de Copy se houver cards na fila.
import crypto from 'node:crypto';
import { contextoInterno } from '../../lib/api.mjs';

export default async () => {
  const { sb } = contextoInterno();
  const fila = await sb('esteira_cr_criativos?status=eq.fila&select=id&limit=1');
  if (!fila.length) return;
  const chave = crypto.createHmac('sha256', process.env.APP_SECRET || '').update('lastlink-criativos').digest('base64url').slice(0, 32);
  const site = process.env.URL || 'https://esteiramineracao.netlify.app';
  await fetch(`${site}/cr-copy-bg`, { method: 'POST', headers: { 'x-cr-chave': chave } }).then((r) => console.log('copy', r.status)).catch((e) => console.error(e));
};

export const config = { schedule: '25 9-23,0-1 * * *' };
