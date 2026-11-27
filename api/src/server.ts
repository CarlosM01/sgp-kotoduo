import { createApp } from './app.js';
import { leerConfig } from './config.js';
import { crearContenedor } from './contenedor.js';

const config = leerConfig();
const contenedor = await crearContenedor(config);

const server = createApp({
  corsOrigin: config.CORS_ORIGIN,
  trustProxy: config.TRUST_PROXY,
  servicios: contenedor.servicios,
}).listen(
  config.API_PORT,
  () => {
    console.log(`SGP API listening on http://localhost:${config.API_PORT}`);
  },
);

function apagar(senal: string) {
  console.log(`${senal} received, closing connections`);
  server.close(() => {
    void contenedor.cerrar().then(() => process.exit(0));
  });
}
process.on('SIGINT', () => apagar('SIGINT'));
process.on('SIGTERM', () => apagar('SIGTERM'));
