/**
 * NestJS adapter integration tests.
 *
 * Each test group spins up a throwaway Nest application with a minimal
 * controller and a stub resolver, then fires HTTP requests via supertest.
 * The focus is on the guard's decision logic — not on HTTP mechanics.
 *
 * We use `reflect-metadata` here because NestJS decorators require it.
 */
import 'reflect-metadata';
import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Authenticated, CurrentSubject, Public, RequirePermissions } from '../../src/nestjs/decorators.js';
import { NestGuardModule } from '../../src/nestjs/nestguard.module.js';
import type { Subject } from '../../src/core/types.js';

// ── Shared helpers ─────────────────────────────────────────────────────────────

function makeSubject(permissions: string[], overrides: Partial<Subject> = {}): Subject {
  return { id: 'user-1', roles: [], permissions: new Set(permissions), ...overrides };
}

/**
 * Build and start a minimal Nest app with NestGuardModule configured via
 * a resolver that returns `resolvedSubject`. Returns the ready app and a
 * setter so tests can swap the subject between requests.
 */
async function buildApp(
  controller: new (...args: unknown[]) => unknown,
  resolverFn: (req: unknown) => Subject | Promise<Subject>,
  roles?: Record<string, string[]>,
): Promise<INestApplication> {
  @Module({
    imports: [NestGuardModule.forRoot({ resolver: resolverFn, roles })],
    controllers: [controller],
  })
  class TestAppModule {}

  const moduleRef = await Test.createTestingModule({
    imports: [TestAppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

// ── Test controllers ───────────────────────────────────────────────────────────

@Controller()
class BasicController {
  @Get('public')
  @Public()
  publicRoute(): string {
    return 'public';
  }

  @Get('authenticated')
  @Authenticated()
  authenticatedRoute(): string {
    return 'authenticated';
  }

  @Get('protected')
  @RequirePermissions('invoice.edit')
  protectedRoute(): string {
    return 'protected';
  }

  @Get('no-decorator')
  noDecorator(): string {
    return 'should-never-reach';
  }

  @Get('subject')
  @Authenticated()
  subjectRoute(@CurrentSubject() subject: Subject): object {
    return { id: subject.id, tenantId: subject.tenantId };
  }
}

@Controller()
class MultiPermController {
  /** AND: both 'invoice.edit' AND 'audit.read' required */
  @Get('and')
  @RequirePermissions('invoice.edit', 'audit.read')
  andRoute(): string {
    return 'and';
  }

  /** OR: 'invoice.edit' OR 'audit.read' */
  @Get('or')
  @RequirePermissions('invoice.edit', 'audit.read', { mode: 'any' })
  orRoute(): string {
    return 'or';
  }
}

@Controller()
class RolesMapController {
  @Get('admin')
  @RequirePermissions('*')
  adminRoute(): string {
    return 'admin';
  }

  @Get('user-profile')
  @RequirePermissions('profile.edit')
  userRoute(): string {
    return 'user';
  }

  @Get('invoice')
  @RequirePermissions('invoice.edit')
  invoiceRoute(): string {
    return 'invoice';
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('NestGuard — basic route decisions', () => {
  let app: INestApplication;
  const resolver = vi.fn<[unknown], Subject>();

  beforeEach(async () => {
    resolver.mockReturnValue(makeSubject(['invoice.edit']));
    app = await buildApp(BasicController, resolver);
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it('@Public() — allows without calling the resolver', async () => {
    await request(app.getHttpServer()).get('/public').expect(200).expect('public');
    expect(resolver).not.toHaveBeenCalled();
  });

  it('@Authenticated() — allows when resolver succeeds', async () => {
    await request(app.getHttpServer()).get('/authenticated').expect(200).expect('authenticated');
  });

  it('@Authenticated() — denies (401) when resolver throws', async () => {
    resolver.mockImplementation(() => { throw new Error('no token'); });
    await request(app.getHttpServer()).get('/authenticated').expect(401);
  });

  it('@RequirePermissions — allows when subject holds the permission', async () => {
    await request(app.getHttpServer()).get('/protected').expect(200).expect('protected');
  });

  it('@RequirePermissions — denies (403) when subject lacks the permission', async () => {
    resolver.mockReturnValue(makeSubject(['profile.read']));
    await request(app.getHttpServer()).get('/protected').expect(403);
  });

  it('no decorator — denies (403) — fail-closed', async () => {
    await request(app.getHttpServer()).get('/no-decorator').expect(403);
  });

  it('@CurrentSubject() — injects the resolved subject into the handler', async () => {
    resolver.mockReturnValue(makeSubject([], { id: 'user-42', tenantId: 'tenant-xyz' }));
    const res = await request(app.getHttpServer()).get('/subject').expect(200);
    expect(res.body).toEqual({ id: 'user-42', tenantId: 'tenant-xyz' });
  });
});

describe('NestGuard — AND / OR logic', () => {
  let app: INestApplication;
  const resolver = vi.fn<[unknown], Subject>();

  beforeEach(async () => {
    app = await buildApp(MultiPermController, resolver);
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it('AND — allows when subject holds ALL required permissions', async () => {
    resolver.mockReturnValue(makeSubject(['invoice.edit', 'audit.read']));
    await request(app.getHttpServer()).get('/and').expect(200).expect('and');
  });

  it('AND — denies when subject holds only one of the required permissions', async () => {
    resolver.mockReturnValue(makeSubject(['invoice.edit']));
    await request(app.getHttpServer()).get('/and').expect(403);
  });

  it('AND — denies when subject holds none of the required permissions', async () => {
    resolver.mockReturnValue(makeSubject(['profile.read']));
    await request(app.getHttpServer()).get('/and').expect(403);
  });

  it('OR — allows when subject holds at least one required permission', async () => {
    resolver.mockReturnValue(makeSubject(['audit.read']));
    await request(app.getHttpServer()).get('/or').expect(200).expect('or');
  });

  it('OR — allows when subject holds both required permissions', async () => {
    resolver.mockReturnValue(makeSubject(['invoice.edit', 'audit.read']));
    await request(app.getHttpServer()).get('/or').expect(200).expect('or');
  });

  it('OR — denies when subject holds none of the required permissions', async () => {
    resolver.mockReturnValue(makeSubject(['profile.read']));
    await request(app.getHttpServer()).get('/or').expect(403);
  });
});

describe('NestGuard — static roles map', () => {
  let app: INestApplication;
  const resolver = vi.fn<[unknown], Subject>();

  const rolesMap = {
    admin: ['*'],
    user: ['profile.read', 'profile.edit'],
  };

  beforeEach(async () => {
    app = await buildApp(RolesMapController, resolver, rolesMap);
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it('admin role gets * and can access any permission-gated route', async () => {
    // resolver returns subject with roles: ['admin'], no permissions set
    resolver.mockReturnValue({ id: 'u1', roles: ['admin'], permissions: new Set() });
    await request(app.getHttpServer()).get('/admin').expect(200);
    await request(app.getHttpServer()).get('/user-profile').expect(200);
  });

  it('user role can access routes covered by their role permissions', async () => {
    resolver.mockReturnValue({ id: 'u2', roles: ['user'], permissions: new Set() });
    await request(app.getHttpServer()).get('/user-profile').expect(200);
  });

  it('user role cannot access routes not covered by their role permissions', async () => {
    resolver.mockReturnValue({ id: 'u2', roles: ['user'], permissions: new Set() });
    await request(app.getHttpServer()).get('/invoice').expect(403);
  });

  it('unknown role gets no permissions and is denied', async () => {
    resolver.mockReturnValue({ id: 'u3', roles: ['unknown-role'], permissions: new Set() });
    await request(app.getHttpServer()).get('/user-profile').expect(403);
  });

  it('multiple roles union their permissions', async () => {
    // user role has profile.edit; add a custom role with invoice.edit
    const extendedRoles = { ...rolesMap, accountant: ['invoice.edit'] };
    await app.close();
    app = await buildApp(
      RolesMapController,
      () => ({ id: 'u4', roles: ['user', 'accountant'], permissions: new Set() }),
      extendedRoles,
    );
    await request(app.getHttpServer()).get('/user-profile').expect(200);
    await request(app.getHttpServer()).get('/invoice').expect(200);
  });
});

describe('NestGuard — wildcard and scope permissions', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app.close();
  });

  it('invoice.* wildcard grants access to invoice.edit route', async () => {
    app = await buildApp(
      BasicController,
      () => makeSubject(['invoice.*']),
    );
    await request(app.getHttpServer()).get('/protected').expect(200);
  });

  it('superuser * grants access to any permission-gated route', async () => {
    app = await buildApp(
      BasicController,
      () => makeSubject(['*']),
    );
    await request(app.getHttpServer()).get('/protected').expect(200);
  });
});
