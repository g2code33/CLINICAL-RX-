import type { Config } from 'drizzle-kit';

export default {
  schema: './electron/db/schema.ts',
  out: './drizzle',
  driver: 'better-sqlite3',
  dbCredentials: {
    url: './clinical-rx.db',
  },
} satisfies Config;
