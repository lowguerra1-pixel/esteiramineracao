// Agendada: todo dia às 06:10 de Brasília (09:10 UTC). Só dispara a rotina diária em segundo plano (criativos-diario-bg),
// porque sync + veredito passam do tempo de uma função agendada e o Netlify reexecutava a rotina 3 vezes.
import crypto from 'node:crypto';

export default async () => {
  const chave = crypto.createHmac('sha256', process.env.APP_SECRET || '').update('lastlink-criativos').digest('base64url').slice(0, 32);
  const site = process.env.URL || 'https://esteiramineracao.netlify.app';
  const r = await fetch(`${site}/cr-diario-bg`, { method: 'POST', headers: { 'x-cr-chave': chave } }).catch((e) => ({ status: 'erro ' + e.message }));
  console.log('diario', r.status);
};

export const config = { schedule: '10 9 * * *' };
