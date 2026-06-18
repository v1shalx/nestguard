import type { Permission } from './types.js';

/**
 * Tests whether a single granted permission satisfies a single required permission.
 *
 * Rules applied in order — first match wins:
 *
 * 1. Exact match      — 'invoice.edit'      satisfies 'invoice.edit'
 * 2. Superuser        — '*'                 satisfies anything
 * 3. Prefix wildcard  — 'invoice.*'         satisfies 'invoice.edit', 'invoice.edit.own', etc.
 *                       Wildcard must be trailing `.*` — partial-word globs are not supported.
 * 4. Scope elevation  — 'invoice.edit.all'  satisfies 'invoice.edit.own'
 *                       Having .all implies .own; the reverse does NOT hold.
 *
 * @param granted  - A permission string the subject holds.
 * @param required - The permission string being tested.
 */
export function matchesPermission(granted: Permission, required: Permission): boolean {
  // Rule 1: exact match
  if (granted === required) return true;

  // Rule 2: superuser wildcard
  if (granted === '*') return true;

  // Rule 3: prefix wildcard — 'invoice.*' matches anything starting with 'invoice.'
  if (granted.endsWith('.*')) {
    const prefix = granted.slice(0, -1); // 'invoice.*' → 'invoice.'
    if (required.startsWith(prefix)) return true;
  }

  // Rule 4: scope elevation — .all subsumes .own
  if (granted.endsWith('.all') && required.endsWith('.own')) {
    const grantedBase = granted.slice(0, -'.all'.length);
    const requiredBase = required.slice(0, -'.own'.length);
    if (grantedBase === requiredBase) return true;
  }

  return false;
}

/**
 * Tests whether a subject's full permission set satisfies a single required permission.
 *
 * Iterates granted permissions and returns true on the first match.
 * Returns false immediately if the set is empty (fail closed).
 *
 * @param permissions - The subject's full permission set.
 * @param required    - The permission to check for.
 */
export function subjectHasPermission(
  permissions: Set<Permission>,
  required: Permission,
): boolean {
  for (const granted of permissions) {
    if (matchesPermission(granted, required)) return true;
  }
  return false;
}
