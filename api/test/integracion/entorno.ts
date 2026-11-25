// Loads the repository .env (if present) so the tests reach the same
// databases as `docker compose up`. Variables already set in the shell win.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ruta = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(ruta)) {
  const previas = { ...process.env };
  process.loadEnvFile(ruta);
  Object.assign(process.env, previas);
}
