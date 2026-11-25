// De hora em hora (:40): só dispara a rotina horária em segundo plano (criativos-hora-bg: sync Meta de hoje + Lastlink).
import crypto from 'node:crypto';

export default async () => {
  const chave = crypto.createHmac('sha256', process.env.APP_SECRET || '').update('lastlink-criativos').digest('base64url').slice(0, 32);
  const site = process.env.URL || 'https://esteiramineracao.netlify.app';
  const r = await fetch(`${site}/cr-hora-bg`, { method: 'POST', headers: { 'x-cr-chave': chave } }).catch((e) => ({ status: 'erro ' + e.message }));
  console.log('hora', r.status);
};

export const config = { schedule: '40 * * * *' };
