/**
 * The resolved actor for a request.
 *
 * NestGuard never constructs this — your SubjectResolver does.
 * That's intentional: you own your user model, auth strategy, and DB.
 */
export interface Subject {
  /** Unique identifier for the user/entity making the request. */
  id: string;

  /**
   * The tenant this subject is acting within.
   * Optional — omit for single-tenant applications.
   *
   * SECURITY: Never trust a tenant ID supplied by the client.
   * Your resolver must derive this from the authenticated token
   * and validate the user belongs to that tenant.
   */
  tenantId?: string;

  /**
   * Role names assigned to this subject.
   * Informational in v1 — the guard works off `permissions`.
   * Useful for reading in handlers via @CurrentSubject() to apply
   * role-specific business logic after the guard grants access.
   */
  roles: string[];

  /**
   * The full set of permission strings this subject holds.
   * Resolved fresh per request by your SubjectResolver.
   *
   * Supports:
   *   - Exact:     'invoice.edit'
   *   - Wildcard:  'invoice.*'       (any invoice.* permission)
   *   - Superuser: '*'               (matches everything)
   *   - Scoped:    'invoice.edit.all' (also satisfies 'invoice.edit.own')
   */
  permissions: Set<string>;
}

/**
 * A permission string in dot-notation.
 *
 * Type alias for string — kept separate so call sites are self-documenting
 * and v2 can widen this to a structured type without breaking the public API.
 */
export type Permission = string;

/**
 * The single interface developers implement to plug NestGuard
 * into their authentication and data layer.
 *
 * Called once per request by the NestGuard guard. The resolved Subject
 * is attached to the request and available via @CurrentSubject().
 *
 * @example
 * class MyResolver implements SubjectResolver {
 *   async resolve(req: Request): Promise<Subject> {
 *     const perms = await this.db.loadPermissions(req.user.id);
 *     return { id: req.user.id, roles: req.user.roles, permissions: new Set(perms) };
 *   }
 * }
 */
export interface SubjectResolver {
  resolve(request: unknown): Subject | Promise<Subject>;
}
