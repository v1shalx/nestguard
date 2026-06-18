/**
 * NestGuard — multi-tenant role & permission engine for NestJS.
 *
 * This is the default entry point (`import 'nestguard'`).
 * It re-exports the framework-agnostic core only.
 *
 * For the NestJS adapter, import from 'nestguard/nestjs'.
 * For the Postgres store, import from 'nestguard/postgres'.
 * For the Redis cache, import from 'nestguard/redis'.
 */

export * from './core/index.js';
