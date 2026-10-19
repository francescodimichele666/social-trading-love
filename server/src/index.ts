import { buildApp } from './app.js';
import { config } from './config.js';
import { migrate } from './migrate.js';
import { syncStaff } from './staff.js';

await migrate();
await syncStaff();
const app = await buildApp({ logger: true });
await app.listen({ port: config.port, host: '0.0.0.0' });
