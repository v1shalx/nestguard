-- NestGuard PostgreSQL Schema
-- Version: 1
--
-- All objects live in the `nestguard` schema to avoid collisions with
-- application tables. Run this file once during your initial migration.
--
-- Usage:
--   psql -d your_db -f schema.sql
--
-- Multi-tenancy notes:
--   - `tenant_id` columns are VARCHAR so they work with any tenant ID format
--     (UUID, slug, integer-as-string, etc).
--   - NULL tenant_id means the row is global (applies across all tenants).
--   - For row-level tenant isolation, add a CHECK constraint or RLS policy
--     on your application tables — NestGuard does not manage your data.

CREATE SCHEMA IF NOT EXISTS nestguard;

-- ── Roles ─────────────────────────────────────────────────────────────────────
-- A role is a named bundle of permissions.
-- tenant_id = NULL means the role is available globally to all tenants.

CREATE TABLE IF NOT EXISTS nestguard.roles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  tenant_id   VARCHAR(200),                       -- NULL = global role
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_roles_name_tenant UNIQUE (name, tenant_id)
);

-- ── Permissions ───────────────────────────────────────────────────────────────
-- A catalog of all known permission strings.
-- NestGuard itself does not enforce that only catalogued permissions are used,
-- but storing them here enables admin UIs and auditing.

CREATE TABLE IF NOT EXISTS nestguard.permissions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(200) NOT NULL UNIQUE,       -- e.g. 'invoice.edit', 'invoice.*'
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Role → Permissions junction ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nestguard.role_permissions (
  role_id       UUID NOT NULL REFERENCES nestguard.roles(id)       ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES nestguard.permissions(id) ON DELETE CASCADE,

  PRIMARY KEY (role_id, permission_id)
);

-- ── User → Role assignments ───────────────────────────────────────────────────
-- Maps a user (identified by your app's user ID) to a role within a tenant.
-- tenant_id = NULL means the assignment is global (applies in every tenant).
--
-- SECURITY: Never derive tenant_id from a client-supplied value. Your
-- SubjectResolver must validate the tenant from the authenticated token.

CREATE TABLE IF NOT EXISTS nestguard.user_roles (
  user_id     VARCHAR(200) NOT NULL,
  role_id     UUID         NOT NULL REFERENCES nestguard.roles(id) ON DELETE CASCADE,
  --
  -- Empty string '' means "global — applies in every tenant context".
  -- This avoids NULL in the composite PK (PK columns must be NOT NULL in SQL)
  -- while keeping a clean, index-friendly key structure.
  --
  tenant_id   VARCHAR(200) NOT NULL DEFAULT '',
  assigned_at TIMESTAMPTZ  NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, role_id, tenant_id)
);

-- ── Permissions version ───────────────────────────────────────────────────────
-- Used by the Redis cache layer (Phase 4) for version-based invalidation.
-- Bump this whenever role/permission assignments change for a tenant.
--
-- Usage in your application:
--   UPDATE nestguard.permissions_version SET version = version + 1
--   WHERE tenant_id = $tenantId;
--   -- Or use bump_permissions_version() helper below.

CREATE TABLE IF NOT EXISTS nestguard.permissions_version (
  tenant_id   VARCHAR(200) PRIMARY KEY,           -- Use '' for the global/single-tenant case
  version     BIGINT       NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── Helper function: bump a tenant's permissions version ──────────────────────

CREATE OR REPLACE FUNCTION nestguard.bump_permissions_version(p_tenant_id VARCHAR)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO nestguard.permissions_version (tenant_id, version, updated_at)
    VALUES (p_tenant_id, 1, now())
  ON CONFLICT (tenant_id) DO UPDATE
    SET version    = nestguard.permissions_version.version + 1,
        updated_at = now();
END;
$$;

-- ── Indexes ───────────────────────────────────────────────────────────────────
-- The resolver's hot query path: load all roles+permissions for a user in a tenant.

CREATE INDEX IF NOT EXISTS idx_user_roles_user_tenant
  ON nestguard.user_roles (user_id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role
  ON nestguard.role_permissions (role_id);
