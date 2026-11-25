// Environment configuration, validated at startup: the API refuses to start
// with a missing or weak setting instead of failing later at request time.
import { z } from 'zod';

const ConfigSchema = z.object({
  DATABASE_URL: z.string().min(1),
  MONGO_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must have at least 32 characters'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  NODE_ENV: z.string().default('development'),
});

export type Config = z.infer<typeof ConfigSchema>;

const PLACEHOLDER_SECRET = 'replace_with_a_long_random_string';

export function leerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = ConfigSchema.safeParse(env);
  if (!r.success) {
    const campos = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${campos}`);
  }
  if (r.data.JWT_SECRET === PLACEHOLDER_SECRET && r.data.NODE_ENV === 'production') {
    throw new Error('Invalid configuration: JWT_SECRET still has the .env.example placeholder');
  }
  return r.data;
}
