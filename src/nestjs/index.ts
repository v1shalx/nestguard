/**
 * @module nestguard/nestjs
 *
 * NestJS adapter for the NestGuard permission engine.
 *
 * Public surface:
 *   - NestGuardModule    forRoot() / forRootAsync()
 *   - NestGuard          the CanActivate guard (registered automatically via the module)
 *   - @RequirePermissions, @Public, @Authenticated, @CurrentSubject — route decorators
 *   - NestGuardModuleOptions, NestGuardModuleAsyncOptions, ResolverFn — option types
 *   - PermissionsMetadata — shape stored by @RequirePermissions (useful for custom guards)
 */

export { NestGuardModule } from './nestguard.module.js';
export type { NestGuardModuleOptions, NestGuardModuleAsyncOptions, ResolverFn } from './nestguard.module.js';

export { NestGuard } from './nestguard.guard.js';

export { RequirePermissions, Public, Authenticated, CurrentSubject } from './decorators.js';
export type { PermissionsMetadata } from './decorators.js';

// Tokens are exported so advanced users can inject options or build custom guards.
export {
  NESTGUARD_OPTIONS_TOKEN,
  NESTGUARD_PUBLIC_KEY,
  NESTGUARD_AUTHENTICATED_KEY,
  NESTGUARD_PERMISSIONS_KEY,
  NESTGUARD_SUBJECT_KEY,
} from './tokens.js';
