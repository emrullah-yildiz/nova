import { createEnterpriseApiServer } from '../src/enterprise/api-server.mjs';

const port = Number(process.env.NOVA_API_PORT || 8787);
const corsOrigin = process.env.NOVA_CORS_ORIGIN || '*';
const { server } = createEnterpriseApiServer({ corsOrigin });

server.listen(port, '127.0.0.1', () => {
  console.log('[Nova Enterprise API] listening on http://127.0.0.1:' + port);
});
