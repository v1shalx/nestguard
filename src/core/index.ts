/**
 * @module nestguard/core
 *
 * Framework-agnostic permission engine.
 * Zero NestJS imports — this module stays portable across adapters.
 */

export type { Subject, Permission, SubjectResolver } from './types.js';
export type { CanOptions } from './engine.js';
export { can } from './engine.js';
export { matchesPermission, subjectHasPermission } from './matcher.js';
