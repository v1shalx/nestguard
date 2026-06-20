-- NestGuard — Example Seed Data
--
-- Demonstrates a two-tenant setup with static roles.
-- Run AFTER schema.sql.
--
-- Scenario:
--   Tenant A: alice is an admin; bob is an editor.
--   Tenant B: bob is an admin.
--   Global:   carol has the 'global-reporter' role (no tenant restriction).

BEGIN;

-- ── Permissions ───────────────────────────────────────────────────────────────

INSERT INTO nestguard.permissions (id, name, description) VALUES
  ('00000000-0000-0000-0000-000000000001', 'invoice.read',      'View invoices'),
  ('00000000-0000-0000-0000-000000000002', 'invoice.edit',      'Create and update invoices'),
  ('00000000-0000-0000-0000-000000000003', 'invoice.delete',    'Delete invoices'),
  ('00000000-0000-0000-0000-000000000004', 'profile.read',      'View own profile'),
  ('00000000-0000-0000-0000-000000000005', 'profile.edit',      'Edit own profile'),
  ('00000000-0000-0000-0000-000000000006', 'audit.log',         'Read audit log'),
  ('00000000-0000-0000-0000-000000000007', '*',                 'Superuser — all permissions')
ON CONFLICT (name) DO NOTHING;

-- ── Roles ─────────────────────────────────────────────────────────────────────

INSERT INTO nestguard.roles (id, name, tenant_id) VALUES
  -- Global roles (available in any tenant)
  ('10000000-0000-0000-0000-000000000001', 'admin',             NULL),
  ('10000000-0000-0000-0000-000000000002', 'editor',            NULL),
  ('10000000-0000-0000-0000-000000000003', 'viewer',            NULL),
  ('10000000-0000-0000-0000-000000000004', 'global-reporter',   NULL),
  -- Tenant-specific role override (tenant-A only)
  ('10000000-0000-0000-0000-000000000005', 'restricted-admin',  'tenant-a')
ON CONFLICT ON CONSTRAINT uq_roles_name_tenant DO NOTHING;

-- ── Role → Permission assignments ─────────────────────────────────────────────

-- admin: superuser
INSERT INTO nestguard.role_permissions (role_id, permission_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000007')
ON CONFLICT DO NOTHING;

-- editor: invoice CRUD + profile read
INSERT INTO nestguard.role_permissions (role_id, permission_id) VALUES
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004')
ON CONFLICT DO NOTHING;

-- viewer: invoice.read + profile.read
INSERT INTO nestguard.role_permissions (role_id, permission_id) VALUES
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004')
ON CONFLICT DO NOTHING;

-- global-reporter: audit.log only
INSERT INTO nestguard.role_permissions (role_id, permission_id) VALUES
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000006')
ON CONFLICT DO NOTHING;

-- restricted-admin (tenant-a): everything except delete
INSERT INTO nestguard.role_permissions (role_id, permission_id) VALUES
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000004'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000005'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000006')
ON CONFLICT DO NOTHING;

-- ── User → Role assignments ───────────────────────────────────────────────────

INSERT INTO nestguard.user_roles (user_id, role_id, tenant_id) VALUES
  -- alice: admin in tenant-a
  ('alice', '10000000-0000-0000-0000-000000000001', 'tenant-a'),
  -- bob:   editor in tenant-a, admin in tenant-b
  ('bob',   '10000000-0000-0000-0000-000000000002', 'tenant-a'),
  ('bob',   '10000000-0000-0000-0000-000000000001', 'tenant-b'),
  -- carol: global-reporter — '' means applies in every tenant context
  ('carol', '10000000-0000-0000-0000-000000000004', '')
ON CONFLICT DO NOTHING;

-- ── Permissions version bootstrap ─────────────────────────────────────────────

INSERT INTO nestguard.permissions_version (tenant_id, version) VALUES
  ('tenant-a', 1),
  ('tenant-b', 1),
  ('',         1)   -- global / single-tenant slot
ON CONFLICT DO NOTHING;

COMMIT;
