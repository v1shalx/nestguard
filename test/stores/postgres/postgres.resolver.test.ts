/**
 * PostgresSubjectResolver integration tests using pg-mem.
 *
 * pg-mem provides an in-memory PostgreSQL engine compatible with the `pg`
 * driver, so these tests run without a real database or Docker container.
 *
 * Test data mirrors seed.example.sql for consistency.
 */
import { randomUUID } from 'crypto';
import { DataType, newDb } from 'pg-mem';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresSubjectResolver } from '../../../src/stores/postgres/postgres.resolver.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

// ── Setup helpers ──────────────────────────────────────────────────────────────

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function createInMemoryPool(): Pool {
  const db = newDb();

  // pg-mem doesn't ship gen_random_uuid() — register it using Node's crypto.
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    implementation: () => randomUUID(),
    impure: true, // different value on each call
  });

  const { Pool: PgMemPool } = db.adapters.createPg();
  return new PgMemPool() as unknown as Pool;
}

/** Well-known IDs used across all tests (mirrors seed.example.sql) */
const IDS = {
  perms: {
    invoiceRead:   '00000000-0000-0000-0000-000000000001',
    invoiceEdit:   '00000000-0000-0000-0000-000000000002',
    invoiceDelete: '00000000-0000-0000-0000-000000000003',
    profileRead:   '00000000-0000-0000-0000-000000000004',
    profileEdit:   '00000000-0000-0000-0000-000000000005',
    auditLog:      '00000000-0000-0000-0000-000000000006',
    superuser:     '00000000-0000-0000-0000-000000000007',
  },
  roles: {
    admin:          '10000000-0000-0000-0000-000000000001',
    editor:         '10000000-0000-0000-0000-000000000002',
    viewer:         '10000000-0000-0000-0000-000000000003',
    globalReporter: '10000000-0000-0000-0000-000000000004',
  },
};

async function seedDatabase(pool: Pool): Promise<void> {
  // Schema — read from source file
  const schemaPath = join(__dirname, '../../../src/stores/postgres/schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8')
    // pg-mem does not support CREATE OR REPLACE FUNCTION — strip the helper fn
    // and the DEFERRABLE clause; both are pg-mem quirks in our version.
    .replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/g, '')
    .replace(/DEFERRABLE INITIALLY DEFERRED/g, '');

  await pool.query(schema);

  // Permissions
  await pool.query(`
    INSERT INTO nestguard.permissions (id, name, description) VALUES
      ($1,  'invoice.read',   'View invoices'),
      ($2,  'invoice.edit',   'Edit invoices'),
      ($3,  'invoice.delete', 'Delete invoices'),
      ($4,  'profile.read',   'View profile'),
      ($5,  'profile.edit',   'Edit profile'),
      ($6,  'audit.log',      'Read audit log'),
      ($7,  '*',              'Superuser')
  `, [
    IDS.perms.invoiceRead, IDS.perms.invoiceEdit, IDS.perms.invoiceDelete,
    IDS.perms.profileRead, IDS.perms.profileEdit,
    IDS.perms.auditLog, IDS.perms.superuser,
  ]);

  // Roles (all global except the tenant-specific restricted-admin we add per-test)
  await pool.query(`
    INSERT INTO nestguard.roles (id, name, tenant_id) VALUES
      ($1, 'admin',           NULL),
      ($2, 'editor',          NULL),
      ($3, 'viewer',          NULL),
      ($4, 'global-reporter', NULL)
  `, [IDS.roles.admin, IDS.roles.editor, IDS.roles.viewer, IDS.roles.globalReporter]);

  // admin → * (superuser)
  await pool.query(
    `INSERT INTO nestguard.role_permissions (role_id, permission_id) VALUES ($1, $2)`,
    [IDS.roles.admin, IDS.perms.superuser],
  );

  // editor → invoice.read, invoice.edit, profile.read
  await pool.query(`
    INSERT INTO nestguard.role_permissions (role_id, permission_id) VALUES
      ($1, $2), ($1, $3), ($1, $4)
  `, [IDS.roles.editor, IDS.perms.invoiceRead, IDS.perms.invoiceEdit, IDS.perms.profileRead]);

  // viewer → invoice.read, profile.read
  await pool.query(`
    INSERT INTO nestguard.role_permissions (role_id, permission_id) VALUES
      ($1, $2), ($1, $3)
  `, [IDS.roles.viewer, IDS.perms.invoiceRead, IDS.perms.profileRead]);

  // global-reporter → audit.log
  await pool.query(
    `INSERT INTO nestguard.role_permissions (role_id, permission_id) VALUES ($1, $2)`,
    [IDS.roles.globalReporter, IDS.perms.auditLog],
  );

  // User-role assignments — use '' for global (no specific tenant)
  await pool.query(`
    INSERT INTO nestguard.user_roles (user_id, role_id, tenant_id) VALUES
      ('alice', $1, 'tenant-a'),
      ('bob',   $2, 'tenant-a'),
      ('bob',   $1, 'tenant-b'),
      ('carol', $3, '')
  `, [IDS.roles.admin, IDS.roles.editor, IDS.roles.globalReporter]);

  // Permissions version
  await pool.query(`
    INSERT INTO nestguard.permissions_version (tenant_id, version) VALUES
      ('tenant-a', 1), ('tenant-b', 1), ('', 1)
  `);
}

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('PostgresSubjectResolver', () => {
  let pool: Pool;
  let resolver: PostgresSubjectResolver;

  beforeAll(async () => {
    pool = createInMemoryPool();
    await seedDatabase(pool);
    resolver = new PostgresSubjectResolver({
      pool,
      extractIdentity: (req: unknown) => req as { userId: string; tenantId?: string },
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  // ── Basic resolution ───────────────────────────────────────────────────────

  it('returns correct subject for alice in tenant-a (admin → *)', async () => {
    const subject = await resolver.resolve({ userId: 'alice', tenantId: 'tenant-a' });

    expect(subject.id).toBe('alice');
    expect(subject.tenantId).toBe('tenant-a');
    expect(subject.roles).toContain('admin');
    expect(subject.permissions.has('*')).toBe(true);
  });

  it('returns correct subject for bob in tenant-a (editor)', async () => {
    const subject = await resolver.resolve({ userId: 'bob', tenantId: 'tenant-a' });

    expect(subject.id).toBe('bob');
    expect(subject.roles).toContain('editor');
    expect(subject.permissions.has('invoice.read')).toBe(true);
    expect(subject.permissions.has('invoice.edit')).toBe(true);
    expect(subject.permissions.has('profile.read')).toBe(true);
    // Editor does NOT have delete or audit permissions
    expect(subject.permissions.has('invoice.delete')).toBe(false);
    expect(subject.permissions.has('audit.log')).toBe(false);
  });

  it('returns correct subject for bob in tenant-b (admin)', async () => {
    const subject = await resolver.resolve({ userId: 'bob', tenantId: 'tenant-b' });

    expect(subject.tenantId).toBe('tenant-b');
    expect(subject.roles).toContain('admin');
    expect(subject.permissions.has('*')).toBe(true);
    // Bob is editor in tenant-a, NOT in tenant-b — permissions should not bleed across tenants
    expect(subject.roles).not.toContain('editor');
  });

  // ── Global (NULL tenant) assignments ──────────────────────────────────────

  it('carol with a global role resolves correctly with any tenantId', async () => {
    const subjectA = await resolver.resolve({ userId: 'carol', tenantId: 'tenant-a' });
    const subjectB = await resolver.resolve({ userId: 'carol', tenantId: 'tenant-b' });

    expect(subjectA.roles).toContain('global-reporter');
    expect(subjectA.permissions.has('audit.log')).toBe(true);

    expect(subjectB.roles).toContain('global-reporter');
    expect(subjectB.permissions.has('audit.log')).toBe(true);
  });

  it('carol resolves correctly with no tenantId (single-tenant mode)', async () => {
    const subject = await resolver.resolve({ userId: 'carol' });

    expect(subject.tenantId).toBeUndefined();
    expect(subject.roles).toContain('global-reporter');
    expect(subject.permissions.has('audit.log')).toBe(true);
  });

  // ── Unknown / unauthorised users ──────────────────────────────────────────

  it('returns empty roles and permissions for a user with no assignments', async () => {
    const subject = await resolver.resolve({ userId: 'nobody', tenantId: 'tenant-a' });

    expect(subject.id).toBe('nobody');
    expect(subject.roles).toHaveLength(0);
    expect(subject.permissions.size).toBe(0);
  });

  it('alice in tenant-b (no assignment) gets empty permissions', async () => {
    const subject = await resolver.resolve({ userId: 'alice', tenantId: 'tenant-b' });

    expect(subject.roles).toHaveLength(0);
    expect(subject.permissions.size).toBe(0);
  });

  // ── Tenant isolation ──────────────────────────────────────────────────────

  it('tenant-a and tenant-b roles do not bleed into each other', async () => {
    const aliceA = await resolver.resolve({ userId: 'alice', tenantId: 'tenant-a' });
    const aliceB = await resolver.resolve({ userId: 'alice', tenantId: 'tenant-b' });

    expect(aliceA.permissions.has('*')).toBe(true);   // admin in tenant-a
    expect(aliceB.permissions.size).toBe(0);           // no role in tenant-b
  });

  // ── Multiple roles union ───────────────────────────────────────────────────

  it('a user with multiple roles has permissions unioned from all roles', async () => {
    // Assign alice the viewer role in tenant-a (in addition to admin)
    await pool.query(
      `INSERT INTO nestguard.user_roles (user_id, role_id, tenant_id) VALUES ($1, $2, $3)`,
      ['alice-multi', IDS.roles.viewer, 'tenant-a'],
    );
    await pool.query(
      `INSERT INTO nestguard.user_roles (user_id, role_id, tenant_id) VALUES ($1, $2, $3)`,
      ['alice-multi', IDS.roles.globalReporter, ''],
    );

    const subject = await resolver.resolve({ userId: 'alice-multi', tenantId: 'tenant-a' });

    expect(subject.roles).toContain('viewer');
    expect(subject.roles).toContain('global-reporter');
    // viewer: invoice.read, profile.read; global-reporter: audit.log
    expect(subject.permissions.has('invoice.read')).toBe(true);
    expect(subject.permissions.has('profile.read')).toBe(true);
    expect(subject.permissions.has('audit.log')).toBe(true);
    // Should NOT have invoice.edit (editor perm)
    expect(subject.permissions.has('invoice.edit')).toBe(false);
  });

  // ── Roles with no permissions ─────────────────────────────────────────────

  it('a user with a role that has no permissions still has the role in roles array', async () => {
    const emptyRoleId = randomUUID();
    await pool.query(
      `INSERT INTO nestguard.roles (id, name, tenant_id) VALUES ($1, 'empty-role', NULL)`,
      [emptyRoleId],
    );
    await pool.query(
      `INSERT INTO nestguard.user_roles (user_id, role_id, tenant_id) VALUES ('empty-user', $1, '')`,
      [emptyRoleId],
    );

    const subject = await resolver.resolve({ userId: 'empty-user' });

    expect(subject.roles).toContain('empty-role');
    expect(subject.permissions.size).toBe(0);
  });

  // ── Permissions version ───────────────────────────────────────────────────

  it('getPermissionsVersion returns 1 for tenant-a after seeding', async () => {
    const version = await resolver.getPermissionsVersion('tenant-a');
    expect(version).toBe(1);
  });

  it('getPermissionsVersion returns 1 for an unknown tenant (default)', async () => {
    const version = await resolver.getPermissionsVersion('unknown-tenant');
    expect(version).toBe(1);
  });
});
