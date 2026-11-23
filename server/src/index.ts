import { networkInterfaces } from 'node:os';
import { createGameServer } from './server';

const port = Number(process.env.PORT) || 3000;
// Samo za avtomatske teste: pospeši vse čase (npr. 0.1). V navadni igri ni nastavljeno.
const timeScale = Math.min(1, Math.max(0.01, Number(process.env.SKR_TIME_SCALE) || 1));
const server = await createGameServer({ port, host: '0.0.0.0', timeScale });

if (process.env.NODE_ENV !== 'production') {
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((a): a is NonNullable<typeof a> => !!a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
  console.log(`  Lokalno:      http://localhost:${server.port}`);
  for (const a of addresses) console.log(`  Omrežje:      http://${a}:${server.port}`);
}

const shutdown = (): void => {
  void server.close().then(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
