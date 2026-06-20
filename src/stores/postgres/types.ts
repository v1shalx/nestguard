import type { Pool, PoolClient } from 'pg';

/**
 * Accepted connection types for the PostgresSubjectResolver.
 * Pass either a Pool (recommended — manages connection lifecycle)
 * or a PoolClient if you need to share a transaction.
 */
export type PgConnection = Pool | PoolClient;

/**
 * Identity extracted from an incoming request by your `extractIdentity`
 * function. This is the only thing NestGuard needs from the request.
 *
 * SECURITY: `tenantId` must be derived from the authenticated token,
 * never from a client-supplied header or body parameter.
 */
export interface SubjectIdentity {
  /** Your application's user identifier — matches `nestguard.user_roles.user_id`. */
  userId: string;

  /**
   * The tenant context for this request.
   * Omit (or set to undefined) for single-tenant applications.
   */
  tenantId?: string;
}

/**
 * Options for PostgresSubjectResolver.
 *
 * @template TRequest — the type of the raw incoming request object.
 *   Defaults to `unknown`; narrow it to your framework's Request type
 *   so `extractIdentity` is fully typed.
 */
export interface PostgresNestGuardOptions<TRequest = unknown> {
  /**
   * A `pg` Pool or PoolClient used to query the nestguard schema.
   * The resolver never manages connection lifecycle — that is your
   * application's responsibility.
   */
  pool: PgConnection;

  /**
   * Extract the user identity from the incoming request.
   * This is called once per guarded request, so keep it fast — read
   * from the already-verified JWT payload rather than making a DB call here.
   *
   * @example
   * extractIdentity: (req: Request) => ({
   *   userId:   req.user.sub,
   *   tenantId: req.user.tenantId,  // from verified JWT claim, never from client
   * })
   */
  extractIdentity: (request: TRequest) => SubjectIdentity | Promise<SubjectIdentity>;
}
