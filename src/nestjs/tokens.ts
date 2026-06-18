/**
 * Dependency-injection tokens and request-level metadata keys for the NestJS adapter.
 *
 * Centralised here so every file imports from one place — renaming a key
 * is a single-line change with no risk of import-graph drift.
 */

// ── DI tokens ─────────────────────────────────────────────────────────────────

/**
 * Injection token for the NestGuardModuleOptions object.
 * Provided by NestGuardModule and injected into NestGuard.
 */
export const NESTGUARD_OPTIONS_TOKEN = 'NESTGUARD_OPTIONS_TOKEN' as const;

// ── Route metadata keys (used by decorators + reflector) ──────────────────────

/**
 * Marks a route or controller as publicly accessible.
 * Set by @Public(). The guard short-circuits immediately when this is truthy.
 */
export const NESTGUARD_PUBLIC_KEY = 'nestguard:public' as const;

/**
 * Marks a route or controller as requiring any authenticated subject.
 * Set by @Authenticated(). No specific permissions are checked.
 */
export const NESTGUARD_AUTHENTICATED_KEY = 'nestguard:authenticated' as const;

/**
 * Carries the required-permissions metadata for a route or controller.
 * Set by @RequirePermissions(). Shape: { permissions: string[]; mode: 'all' | 'any' }.
 */
export const NESTGUARD_PERMISSIONS_KEY = 'nestguard:permissions' as const;

// ── Request-level keys ─────────────────────────────────────────────────────────

/**
 * Key under which the resolved Subject is stored on the incoming request object.
 * Written by NestGuard after a successful resolve; read by @CurrentSubject().
 */
export const NESTGUARD_SUBJECT_KEY = '__nestguard_subject__' as const;
