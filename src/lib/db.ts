import postgres from 'postgres';
import { config } from './config.ts';

const globalDatabase = globalThis as typeof globalThis & {
  ocpiLabSql?: ReturnType<typeof postgres>;
};

export function db() {
  globalDatabase.ocpiLabSql ??= postgres(config().DATABASE_URL, {
    max: process.env.NODE_ENV === 'production' ? 2 : 5,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return globalDatabase.ocpiLabSql;
}
