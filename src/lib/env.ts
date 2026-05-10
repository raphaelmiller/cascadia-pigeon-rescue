/**
 * env.ts — runtime environment guard.
 *
 * Validates the env vars the app actually needs to boot. Imported once from
 * src/lib/prisma.ts so a misconfigured deploy fails fast at startup instead
 * of generating cryptic errors later.
 *
 * No external dep on purpose — keeps the check trivial and avoids pulling
 * zod into the server runtime just for half a dozen strings.
 */

type Env = {
  DATABASE_URL?: string;
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  UPLOADS_DIR?: string;
  NODE_ENV: string;
  AUTH_SECRET?: string;
  ADMIN_PASSWORD?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
};

function required(name: keyof Env, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`[env] Missing required environment variable: ${name}`);
  }
  return value;
}

export function validateEnv(): Env {
  const env = process.env;
  const NODE_ENV = env.NODE_ENV ?? 'development';

  // Production runtime enforcement: we only require that SOME database
  // connection is configured. Choice of dev-vs-prod DB is a deploy decision
  // documented in DEPLOY.md; this guard's only job is to fail fast when
  // the host forgot to inject env at all.
  const isBuildPhase = env.NEXT_PHASE === 'phase-production-build';
  if (NODE_ENV === 'production' && !isBuildPhase) {
    const hasTurso = !!env.TURSO_DATABASE_URL;
    const hasDbUrl = !!env.DATABASE_URL;
    if (!hasTurso && !hasDbUrl) {
      throw new Error(
        '[env] Production requires DATABASE_URL or TURSO_DATABASE_URL to be set. ' +
        'See .env.example and DEPLOY.md.'
      );
    }
    if (hasTurso) required('TURSO_AUTH_TOKEN', env.TURSO_AUTH_TOKEN);
    required('AUTH_SECRET', env.AUTH_SECRET);
    required('ADMIN_PASSWORD', env.ADMIN_PASSWORD);
  }

  return {
    DATABASE_URL: env.DATABASE_URL,
    TURSO_DATABASE_URL: env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: env.TURSO_AUTH_TOKEN,
    UPLOADS_DIR: env.UPLOADS_DIR,
    NODE_ENV,
    AUTH_SECRET: env.AUTH_SECRET,
    ADMIN_PASSWORD: env.ADMIN_PASSWORD,
    R2_ACCOUNT_ID: env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: env.R2_BUCKET,
  };
}

// Eager validation at module import time.
export const env = validateEnv();
