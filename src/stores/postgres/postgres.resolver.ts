import type { QueryResult } from 'pg';
import type { Subject, SubjectResolver } from '../../core/types.js';
import type { PostgresNestGuardOptions, SubjectIdentity } from './types.js';

/**
 * Row shape returned by the roles+permissions query.
 * `permission_name` is nullable because a role may have no permissions yet.
 */
interface RolePermissionRow {
  role_name: string;
  permission_name: string | null;
}

/**
 * Row shape returned by the permissions version query.
 */
interface VersionRow {
  version: string; // pg returns BIGINT as string
}

/**
 * A reference SubjectResolver backed by the nestguard PostgreSQL schema.
 *
 * Wire it up once in your NestGuardModule configuration:
 *
 * ```ts
 * import { Pool } from 'pg';
 * import { PostgresSubjectResolver } from 'nestguard/postgres';
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 *
 * NestGuardModule.forRoot({
 *   resolver: new PostgresSubjectResolver({
 *     pool,
 *     extractIdentity: (req) => ({
 *       userId:   req.user.sub,
 *       tenantId: req.user.tenantId, // always from verified JWT, never from client
 *     }),
 *   }),
 * });
 * ```
 *
 * The resolver issues a single JOIN query per request. For high-traffic
 * applications, wrap it with the Redis cache layer (Phase 4) to avoid
 * per-request DB hits.
 *
 * @template TRequest — narrow this to your framework's request type for
 *   full type safety inside `extractIdentity`.
 */
export class PostgresSubjectResolver<TRequest = unknown> implements SubjectResolver {
  constructor(private readonly options: PostgresNestGuardOptions<TRequest>) {}

  /**
   * Resolves the Subject for the incoming request.
   *
   * Tenant scoping:
   *   - When `tenantId` is provided: loads user_roles where tenant_id matches
   *     OR is NULL (global assignments), then loads roles where tenant_id
   *     matches OR is NULL (global role definitions).
   *   - When `tenantId` is undefined: loads only globally assigned roles
   *     (user_roles.tenant_id IS NULL).
   *
   * A user with no role assignments in the given tenant gets an empty
   * permission set — fail-closed behaviour is preserved.
   *
   * @throws if the DB query fails — let this propagate to the guard which
   *   will surface it as a 401 UnauthorizedException.
   */
  async resolve(request: unknown): Promise<Subject> {
    const identity = await this.options.extractIdentity(request as TRequest);
    return this.loadSubject(identity);
  }

  /**
   * Returns the current permissions version for the given tenant.
   * Used by the Redis cache layer to detect stale cache entries.
   *
   * Returns 1 if no version row exists yet (treat as initial state).
   */
  async getPermissionsVersion(tenantId?: string): Promise<number> {
    const key = tenantId ?? '';
    const result: QueryResult<VersionRow> = await this.options.pool.query(
      `SELECT version
         FROM nestguard.permissions_version
        WHERE tenant_id = $1`,
      [key],
    );
    if (result.rows.length === 0) return 1;
    return parseInt(result.rows[0].version, 10);
  }

  /**
   * Increments the permissions version for the given tenant.
   * Call this whenever you change role/permission assignments so that cached
   * subjects are invalidated on the next request.
   *
   * This is a thin wrapper around `nestguard.bump_permissions_version()`.
   */
  async bumpPermissionsVersion(tenantId?: string): Promise<void> {
    await this.options.pool.query(
      `SELECT nestguard.bump_permissions_version($1)`,
      [tenantId ?? ''],
    );
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async loadSubject(identity: SubjectIdentity): Promise<Subject> {
    const { userId, tenantId } = identity;
    const rows = await this.queryRolesAndPermissions(userId, tenantId);

    const roles = new Set<string>();
    const permissions = new Set<string>();

    for (const row of rows) {
      roles.add(row.role_name);
      if (row.permission_name !== null) {
        permissions.add(row.permission_name);
      }
    }

    return {
      id: userId,
      tenantId,
      roles: [...roles],
      permissions,
    };
  }

  /**
   * Loads all roles and their permissions for a user in the given tenant.
   *
   * The query is a single LEFT JOIN so roles with zero permissions still appear
   * in the result (role_name is captured; permission_name is NULL). This ensures
   * `subject.roles` is populated even when a role has no permissions assigned yet.
   *
   * Tenant scoping strategy for user_roles:
   *   - Global assignments use tenant_id = '' (empty string sentinel).
   *   - When tenantId is provided: load rows where tenant_id = tenantId OR tenant_id = ''.
   *   - When tenantId is undefined: load only global rows (tenant_id = '').
   *
   * Role definitions (nestguard.roles) use NULL for global roles and a tenant_id
   * string for tenant-specific role overrides — NULL check is correct there since
   * roles.tenant_id is nullable.
   */
  private async queryRolesAndPermissions(
    userId: string,
    tenantId: string | undefined,
  ): Promise<RolePermissionRow[]> {
    const result: QueryResult<RolePermissionRow> = await this.options.pool.query(
      `
      SELECT DISTINCT
        r.name  AS role_name,
        p.name  AS permission_name
      FROM nestguard.user_roles ur
      JOIN nestguard.roles r
        ON r.id = ur.role_id
       AND (r.tenant_id = $2 OR r.tenant_id IS NULL)
      LEFT JOIN nestguard.role_permissions rp
        ON rp.role_id = r.id
      LEFT JOIN nestguard.permissions p
        ON p.id = rp.permission_id
      WHERE ur.user_id = $1
        AND (
          ur.tenant_id = ''
          OR ($2::text IS NOT NULL AND ur.tenant_id = $2)
        )
      ORDER BY r.name, p.name NULLS LAST
      `,
      [userId, tenantId ?? null],
    );

    return result.rows;
  }
}
