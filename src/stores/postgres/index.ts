/**
 * @module nestguard/postgres
 *
 * Optional PostgreSQL reference store for NestGuard.
 *
 * Install the peer dependency before using this module:
 *   npm install pg
 *   npm install --save-dev @types/pg
 *
 * Then run the schema migration:
 *   psql -d your_db -f node_modules/nestguard/src/stores/postgres/schema.sql
 *
 * Wire up in your app:
 *   import { Pool } from 'pg';
 *   import { PostgresSubjectResolver } from 'nestguard/postgres';
 *
 *   NestGuardModule.forRoot({
 *     resolver: new PostgresSubjectResolver({
 *       pool: new Pool({ connectionString: process.env.DATABASE_URL }),
 *       extractIdentity: (req) => ({ userId: req.user.sub, tenantId: req.user.tenantId }),
 *     }),
 *   });
 */

export { PostgresSubjectResolver } from './postgres.resolver.js';
export type { PostgresNestGuardOptions, PgConnection, SubjectIdentity } from './types.js';
