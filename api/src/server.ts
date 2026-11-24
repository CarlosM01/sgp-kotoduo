import { createApp } from './app.js';

const port = Number(process.env.API_PORT ?? 3000);
const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

createApp({ corsOrigin }).listen(port, () => {
  console.log(`SGP API listening on http://localhost:${port}`);
});
