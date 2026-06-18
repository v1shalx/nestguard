import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can } from '../core/engine.js';
import type { Subject } from '../core/types.js';
import type { PermissionsMetadata } from './decorators.js';
import type { NestGuardModuleOptions } from './nestguard.module.js';
import {
  NESTGUARD_AUTHENTICATED_KEY,
  NESTGUARD_OPTIONS_TOKEN,
  NESTGUARD_PERMISSIONS_KEY,
  NESTGUARD_PUBLIC_KEY,
  NESTGUARD_SUBJECT_KEY,
} from './tokens.js';

/**
 * The core NestGuard CanActivate guard.
 *
 * Registered as a global APP_GUARD by NestGuardModule — you never instantiate
 * this directly. Its decision flow per request:
 *
 * 1. @Public()            → allow immediately (resolver is NOT called)
 * 2. Resolve Subject      → on resolver error, deny (fail-closed)
 * 3. @Authenticated()     → allow (subject resolved = authenticated)
 * 4. @RequirePermissions  → delegate to can() from core
 * 5. No decorator         → deny (fail-closed)
 *
 * The resolved Subject is attached to `request[NESTGUARD_SUBJECT_KEY]` so that
 * @CurrentSubject() can retrieve it from the handler parameter list.
 */
@Injectable()
export class NestGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(NESTGUARD_OPTIONS_TOKEN)
    private readonly options: NestGuardModuleOptions,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // ── Step 1: @Public() — skip everything, allow immediately ───────────────
    const isPublic = this.reflector.getAllAndOverride<boolean>(NESTGUARD_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // ── Step 2: Resolve the Subject ───────────────────────────────────────────
    // Fail-closed: any resolver error → deny. We never swallow the exception
    // silently; it is re-thrown as an UnauthorizedException so the response
    // body is consistent (401) rather than a raw 500.
    const request: Record<string, unknown> = context.switchToHttp().getRequest();
    let subject: Subject;
    try {
      subject = await this.resolveSubject(request);
    } catch (err) {
      // Surface as 401 so the client knows it is an auth/identity issue, not a
      // server bug. We re-throw so NestJS exception filters can handle it.
      throw new UnauthorizedException(
        err instanceof Error ? err.message : 'Subject resolution failed',
      );
    }

    // Attach to request so @CurrentSubject() can read it without another resolve.
    request[NESTGUARD_SUBJECT_KEY] = subject;

    // ── Step 3: @Authenticated() — any valid subject is enough ────────────────
    const requiresAuth = this.reflector.getAllAndOverride<boolean>(NESTGUARD_AUTHENTICATED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiresAuth) return true;

    // ── Step 4: @RequirePermissions() ─────────────────────────────────────────
    const meta = this.reflector.getAllAndOverride<PermissionsMetadata | undefined>(
      NESTGUARD_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (meta) {
      return can(subject, meta.permissions, { mode: meta.mode });
    }

    // ── Step 5: No recognised decorator → deny (fail-closed) ─────────────────
    // A route that forgets to annotate itself is denied, not silently opened.
    return false;
  }

  /**
   * Normalises the resolver option (SubjectResolver instance or plain function)
   * into a single call, then applies the optional roles map if configured.
   */
  private async resolveSubject(request: unknown): Promise<Subject> {
    const { resolver, roles } = this.options;

    // Support both a SubjectResolver object and a bare function.
    const subject =
      typeof resolver === 'function'
        ? await resolver(request)
        : await resolver.resolve(request);

    // If a static roles map was provided, derive permissions from it.
    // This overrides whatever the resolver set in subject.permissions, so
    // callers can return a Subject with an empty permissions set and rely
    // entirely on the roles map.
    if (roles) {
      const derived = new Set<string>();
      for (const role of subject.roles) {
        const perms = roles[role];
        if (perms) {
          for (const p of perms) derived.add(p);
        }
      }
      return { ...subject, permissions: derived };
    }

    return subject;
  }
}
