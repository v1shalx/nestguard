# NestGuard

**A drop-in, multi-tenant permission engine for NestJS.**

NestGuard owns exactly one decision: *given the current user and a required permission, allow or deny.* It doesn't own your database, your authentication, or your role definitions — you plug those in through a single resolver function, so it works whether your roles are two hardcoded strings or fully dynamic roles each tenant defines at runtime.

[![npm](https://img.shields.io/npm/v/nestguard)](https://www.npmjs.com/package/nestguard)
[![CI](https://github.com/mahajanxvishal/nestguard/actions/workflows/ci.yml/badge.svg)](https://github.com/mahajanxvishal/nestguard/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Install

```bash
npm install nestguard
```

NestJS is a peer dependency — install it separately if you haven't already:

```bash
npm install @nestjs/common @nestjs/core reflect-metadata
```

---

## 30-second quickstart

```ts
// app.module.ts
import { NestGuardModule } from 'nestguard/nestjs';

@Module({
  imports: [
    NestGuardModule.forRoot({
      resolver: async (req) => {
        const perms = await myDb.getPermissions(req.user.id);
        return {
          id:          req.user.id,
          roles:       req.user.roles,
          permissions: new Set(perms),
        };
      },
    }),
  ],
})
export class AppModule {}
```

```ts
// invoices.controller.ts
import { RequirePermissions, Public, Authenticated, CurrentSubject } from 'nestguard/nestjs';
import type { Subject } from 'nestguard';

@Controller('invoices')
export class InvoicesController {
  @Get()
  @RequirePermissions('invoice.read')
  list() { /* only accessible with invoice.read */ }

  @Post()
  @RequirePermissions('invoice.create', 'invoice.read')   // AND — both required
  create() {}

  @Delete(':id')
  @RequirePermissions('invoice.delete.all', 'invoice.delete.own', { mode: 'any' }) // OR
  remove(@CurrentSubject() subject: Subject) {
    // subject.permissions tells you .all vs .own for fine-grained handler logic
  }

  @Get('public-preview')
  @Public()
  preview() { /* no auth needed */ }
}
```

Every route that has **no decorator is denied by default** — fail-closed.

---

## Core concepts

There are four things to understand. If you get these, you can use the whole library.

**1. Subject** — the resolved actor for a request:
```ts
interface Subject {
  id: string;
  tenantId?: string;      // optional — omit for single-tenant apps
  roles: string[];        // informational; the guard works off permissions
  permissions: Set<string>;
}
```

**2. Permission** — a dot-notation string with matching rules:

| Pattern | Matches |
|---|---|
| `invoice.edit` | Exactly `invoice.edit` |
| `invoice.*` | Any `invoice.*` permission |
| `*` | Everything (superuser) |
| `invoice.edit.all` | Also satisfies `invoice.edit.own` (scope elevation) |

**3. SubjectResolver** — the single interface you implement:
```ts
interface SubjectResolver {
  resolve(request: unknown): Subject | Promise<Subject>;
}
```

**4. `can()`** — the decision function (also callable directly in service code):
```ts
import { can } from 'nestguard';

can(subject, 'invoice.edit')                           // single — boolean
can(subject, ['invoice.edit', 'audit.read'])           // AND — all required
can(subject, ['invoice.edit', 'audit.read'], { mode: 'any' }) // OR — any one
```

---

## The three usages

All three work with the same library code. Only the resolver changes.

### App 1 — Simple 2-role app, static permissions

```ts
NestGuardModule.forRoot({
  roles: {
    admin: ['*'],
    user:  ['profile.read', 'profile.edit'],
  },
  resolver: (req) => ({
    id:          req.user.id,
    roles:       [req.user.role],
    permissions: new Set(), // derived from roles map automatically
  }),
});
```

### App 2 — Dynamic 9-role, per-tenant, separate databases

```ts
NestGuardModule.forRoot({
  resolver: async (req) => {
    // tenantId must come from the verified JWT, never from the client
    const tenantId = resolveTenantFromToken(req.user);
    const db       = getTenantConnection(tenantId);
    const { roles, permissions } = await db.loadPermissionsFor(req.user.id);

    return {
      id:          req.user.id,
      tenantId,
      roles,
      permissions: new Set(permissions),
    };
  },
});
```

### App 3 — No roles, just authenticated-or-not

```ts
NestGuardModule.forRoot({
  resolver: (req) => ({
    id:          req.user?.id ?? '',
    roles:       [],
    permissions: new Set(),
  }),
});

// In controllers, use @Authenticated() instead of @RequirePermissions()
@Get('me')
@Authenticated()
getProfile(@CurrentSubject() subject: Subject) { return subject; }
```

---

## Multi-tenancy

NestGuard is tenant-agnostic at the library level. The `tenantId` field on `Subject` is a carry-through value — the guard doesn't inspect it. You control everything:

- **Row isolation** — your resolver queries `WHERE tenant_id = $tenantId`
- **Schema isolation** — your resolver switches the search path
- **Separate-DB isolation** — your resolver calls `getConnection(tenantId)`

All three modes use the same resolver interface. The library never sees your database.

**The most important security rule in this library:**

> Never trust a `tenantId` supplied by the client (header, query param, or body). Derive it from the verified JWT or session token inside your resolver. If a client can forge their tenant ID, they can access any tenant's data.

When a role is deleted or permissions change mid-session, the next request resolves fresh — no stale access is possible. With the Redis cache layer, set a short TTL and call `bumpPermissionsVersion()` on any role/permission change.

---

## The hard parts

These are the design decisions that took the most thought. Worth reading if you're evaluating whether NestGuard fits your architecture.

**Resolve-fresh vs. JWT-version**

There are two strategies for keeping permissions up-to-date after a role change:

1. **Resolve-fresh + cache**: call your resolver on every request, cache the result with a short TTL keyed by `{tenantId}:{userId}`. On role change, call `bumpPermissionsVersion()` to invalidate. This is the default and works without client cooperation.

2. **JWT permissions version**: bake a `permissionsVersion` integer into the JWT at login. On each request, compare it to the DB version. Mismatch → force re-auth. This is zero-latency per request but requires the client to re-login when roles change, and couples your JWT lifetime to your permission freshness requirements.

Neither is universally better. The Redis cache approach is safer for dynamic roles; the JWT approach is better if you control token issuance and want zero per-request DB contact.

**Why the core is framework-agnostic**

`nestguard` (the default import) has zero NestJS imports. The `can()` function is a pure TypeScript function you can call from any framework — or from unit tests without standing up a Nest application. The NestJS adapter (`nestguard/nestjs`) is a thin layer on top. This also means a future Express or Fastify adapter is a new entry point, not a rewrite.

**Fail-closed by default**

A route with no NestGuard decorator returns 403. A resolver that throws returns 401. An empty permission set denies everything. You must explicitly open routes with `@Public()`. Forgetting to annotate a route is a deployment problem (403 in prod), not a security hole.

**`can()` is a pure function**

No singletons, no global state, no DI required. You can call `can(subject, 'invoice.edit')` directly from a service, a CQRS command handler, a queue consumer — anywhere you have a Subject. The guard is just one caller of `can()`.

---

## Decorators

| Decorator | Behaviour |
|---|---|
| `@Public()` | Open to everyone — resolver is not called |
| `@Authenticated()` | Any resolved subject; no specific permission needed |
| `@RequirePermissions('a', 'b')` | AND — subject must hold both `a` and `b` |
| `@RequirePermissions('a', 'b', { mode: 'any' })` | OR — subject must hold at least one |
| `@CurrentSubject()` | Param decorator — injects the resolved `Subject` into the handler |

Decorators can be applied at the controller level (applies to all routes) or method level (overrides controller). Method-level wins.

---

## PostgreSQL reference store

For a production-ready starting point, NestGuard ships an optional PostgreSQL resolver and schema:

```bash
npm install pg
npm install --save-dev @types/pg

# Run the schema once
psql -d your_db -f node_modules/nestguard/src/stores/postgres/schema.sql
```

```ts
import { Pool } from 'pg';
import { PostgresSubjectResolver } from 'nestguard/postgres';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

NestGuardModule.forRoot({
  resolver: new PostgresSubjectResolver({
    pool,
    extractIdentity: (req) => ({
      userId:   req.user.sub,
      tenantId: req.user.tenantId, // from verified JWT, never from client
    }),
  }),
});
```

The schema uses a `nestguard` PostgreSQL schema namespace so it won't collide with your existing tables. See `src/stores/postgres/seed.example.sql` for sample data.

---

## Roadmap (v2)

These are intentionally out of scope for v1. The v1 interfaces are designed to make them possible without breaking changes:

- **ABAC / condition rules** — data-dependent checks (e.g. "edit invoice IF you own it") beyond the `.own`/`.all` scope convention
- **Express adapter** — same core, different entry point
- **GraphQL field-level guards** — per-field resolver integration
- **Admin UI** — a web interface for managing roles and permissions at runtime

---

## Comparison

| | NestGuard | CASL | Casbin |
|---|---|---|---|
| Role definition location | Runtime, per-resolver call | Code (Ability builder) | Policy file / DB |
| Multi-tenant built-in | Yes — tenantId on Subject | No | Via adapter |
| Dynamic roles (per-tenant at runtime) | Yes — headline feature | Partial | Partial |
| Framework | NestJS (core is framework-agnostic) | Any | Any |
| Permission model | String + wildcards + scopes | Subjects / Actions | PERM model |

The key difference: NestGuard lets each tenant define its own role structure at runtime with no code changes, because roles are resolved by your code on every request — never baked into the library at startup.

---

## License

MIT © Vishal Mahajan
