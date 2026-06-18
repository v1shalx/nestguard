import {
  type DynamicModule,
  type FactoryProvider,
  type ModuleMetadata,
  Module,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NestGuard } from './nestguard.guard.js';
import { NESTGUARD_OPTIONS_TOKEN } from './tokens.js';
import type { SubjectResolver } from '../core/types.js';
import type { Subject } from '../core/types.js';

// ── Option types ───────────────────────────────────────────────────────────────

/** A plain resolver function — an alternative to implementing SubjectResolver. */
export type ResolverFn = (request: unknown) => Subject | Promise<Subject>;

/**
 * Configuration object passed to NestGuardModule.forRoot().
 */
export interface NestGuardModuleOptions {
  /**
   * Your subject resolver. Supply either a SubjectResolver instance or a plain
   * async/sync function with the same signature.
   *
   * The resolver is called once per guarded request and must return a fully
   * populated Subject — including `permissions` — unless you also supply the
   * `roles` map, in which case permissions are derived automatically from
   * the subject's `roles` array.
   *
   * SECURITY: Never trust a tenantId supplied by the client. Derive it from
   * the verified authentication token inside your resolver.
   */
  resolver: SubjectResolver | ResolverFn;

  /**
   * Optional static role-to-permissions map.
   *
   * When provided, the guard looks up each role returned by the resolver in
   * this map and unions the results into `subject.permissions`, overriding
   * whatever the resolver set. Use this for simple apps with a fixed set of
   * roles and permissions defined at startup.
   *
   * For dynamic or per-tenant roles, omit this and populate `permissions`
   * directly in your resolver instead.
   *
   * @example
   * roles: {
   *   admin: ['*'],
   *   user:  ['profile.read', 'profile.edit'],
   * }
   */
  roles?: Record<string, string[]>;
}

/**
 * Async configuration for NestGuardModule.forRootAsync().
 * Follows the standard NestJS async-module pattern.
 */
export interface NestGuardModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (
    ...args: unknown[]
  ) => NestGuardModuleOptions | Promise<NestGuardModuleOptions>;
  inject?: FactoryProvider['inject'];
}

// ── Module ─────────────────────────────────────────────────────────────────────

/**
 * The NestGuard module. Register it once at the root of your application.
 *
 * It registers NestGuard as a global APP_GUARD, which means every route is
 * protected by default. Routes opt-in to specific access levels via decorators:
 *   @Public()          — open to everyone
 *   @Authenticated()   — any logged-in subject
 *   @RequirePermissions('…') — specific permission(s)
 *
 * @example — synchronous (static roles)
 * NestGuardModule.forRoot({
 *   roles: { admin: ['*'], user: ['profile.read', 'profile.edit'] },
 *   resolver: (req) => ({ id: req.user.id, roles: [req.user.role], permissions: new Set() }),
 * })
 *
 * @example — synchronous (dynamic resolver, full permissions)
 * NestGuardModule.forRoot({
 *   resolver: async (req) => {
 *     const perms = await db.loadPermissions(req.user.id);
 *     return { id: req.user.id, roles: [], permissions: new Set(perms) };
 *   },
 * })
 *
 * @example — async (inject other providers)
 * NestGuardModule.forRootAsync({
 *   imports: [ConfigModule],
 *   inject: [ConfigService],
 *   useFactory: (config: ConfigService) => ({
 *     resolver: myResolver,
 *   }),
 * })
 */
@Module({})
export class NestGuardModule {
  static forRoot(options: NestGuardModuleOptions): DynamicModule {
    return {
      module: NestGuardModule,
      global: true,
      providers: [
        { provide: NESTGUARD_OPTIONS_TOKEN, useValue: options },
        { provide: APP_GUARD, useClass: NestGuard },
      ],
    };
  }

  static forRootAsync(asyncOptions: NestGuardModuleAsyncOptions): DynamicModule {
    return {
      module: NestGuardModule,
      global: true,
      imports: asyncOptions.imports ?? [],
      providers: [
        {
          provide: NESTGUARD_OPTIONS_TOKEN,
          useFactory: asyncOptions.useFactory,
          inject: asyncOptions.inject ?? [],
        },
        { provide: APP_GUARD, useClass: NestGuard },
      ],
    };
  }
}
