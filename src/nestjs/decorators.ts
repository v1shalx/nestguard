import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import {
  NESTGUARD_AUTHENTICATED_KEY,
  NESTGUARD_PERMISSIONS_KEY,
  NESTGUARD_PUBLIC_KEY,
  NESTGUARD_SUBJECT_KEY,
} from './tokens.js';
import type { Subject } from '../core/types.js';

// ── Metadata shape stored by @RequirePermissions ───────────────────────────────

export interface PermissionsMetadata {
  permissions: string[];
  mode: 'all' | 'any';
}

// ── @RequirePermissions ────────────────────────────────────────────────────────

/**
 * Declares the permissions required to access a route or controller.
 *
 * Usage:
 *   @RequirePermissions('invoice.edit')              // single — AND (trivially)
 *   @RequirePermissions('invoice.edit', 'audit.read') // AND — subject must hold BOTH
 *   @RequirePermissions('invoice.edit', 'audit.read', { mode: 'any' }) // OR
 *
 * The last argument may be an options object `{ mode: 'all' | 'any' }`.
 * If omitted, mode defaults to 'all' (AND).
 *
 * Permission strings support wildcards and scope notation — see matcher.ts.
 *
 * Routes with no NestGuard decorator are denied by default (fail-closed).
 */
export function RequirePermissions(
  ...args: [string, ...Array<string | { mode?: 'all' | 'any' }>]
): MethodDecorator & ClassDecorator {
  const last = args[args.length - 1];
  let mode: 'all' | 'any' = 'all';
  let permissions: string[];

  if (typeof last === 'object' && last !== null) {
    mode = last.mode ?? 'all';
    permissions = args.slice(0, -1) as string[];
  } else {
    permissions = args as string[];
  }

  if (permissions.length === 0) {
    throw new Error(
      '@RequirePermissions must receive at least one permission string. ' +
        'Use @Authenticated() if you only need a valid subject with no specific permission.',
    );
  }

  return SetMetadata<typeof NESTGUARD_PERMISSIONS_KEY, PermissionsMetadata>(
    NESTGUARD_PERMISSIONS_KEY,
    { permissions, mode },
  );
}

// ── @Public ────────────────────────────────────────────────────────────────────

/**
 * Marks a route or controller as publicly accessible — no authentication or
 * permissions are required. The guard will not call the SubjectResolver for
 * public routes, so they remain open even when no token is present.
 *
 * @example
 * @Public()
 * @Get('health')
 * health() { return 'ok'; }
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(NESTGUARD_PUBLIC_KEY, true);

// ── @Authenticated ─────────────────────────────────────────────────────────────

/**
 * Requires a successfully resolved Subject but no specific permission.
 * Use this for routes that any logged-in user may access regardless of role.
 *
 * If the SubjectResolver throws (e.g. missing / expired token), the guard
 * denies the request — fail-closed behaviour is preserved.
 *
 * @example
 * @Authenticated()
 * @Get('me')
 * getProfile(@CurrentSubject() subject: Subject) { return subject; }
 */
export const Authenticated = (): MethodDecorator & ClassDecorator =>
  SetMetadata(NESTGUARD_AUTHENTICATED_KEY, true);

// ── @CurrentSubject ────────────────────────────────────────────────────────────

/**
 * Parameter decorator that injects the resolved Subject into a route handler.
 *
 * The guard attaches the Subject to the request after a successful resolve.
 * Returns `undefined` on public routes (the resolver is not called there).
 *
 * @example
 * @Get('invoices')
 * @RequirePermissions('invoice.read')
 * list(@CurrentSubject() subject: Subject) {
 *   // subject.permissions, subject.tenantId, etc. are available here
 * }
 */
export const CurrentSubject = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Subject | undefined => {
    return ctx.switchToHttp().getRequest()[NESTGUARD_SUBJECT_KEY];
  },
);
