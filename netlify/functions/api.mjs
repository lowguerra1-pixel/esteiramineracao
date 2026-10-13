import { handler } from '../../lib/api.mjs';

export default (req) => handler(req);

export const config = { path: '/api/*' };
