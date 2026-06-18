import type { Subject, Permission } from './types.js';
import { subjectHasPermission } from './matcher.js';

/**
 * Options for the `can()` decision function.
 */
export interface CanOptions {
  /**
   * How to evaluate multiple required permissions:
   *   'all' (default) — subject must hold ALL listed permissions  (AND)
   *   'any'           — subject must hold AT LEAST ONE            (OR)
   */
  mode?: 'all' | 'any';
}

/**
 * The NestGuard decision function — the single thing this library does.
 *
 * Pure function: no side effects, no I/O, no exceptions. Always returns
 * a boolean. The NestJS guard calls this after resolving the subject;
 * you can also call it directly in service-layer code.
 *
 * Fail-closed: a subject with an empty permission set will be denied
 * for any non-empty required list, regardless of mode.
 *
 * @param subject  - The resolved subject (from SubjectResolver).
 * @param required - One permission, or an array for multi-permission checks.
 * @param options  - mode: 'all' | 'any'. Defaults to 'all'.
 *
 * @example
 * can(subject, 'invoice.edit')
 * can(subject, ['invoice.edit', 'invoice.view'])
 * can(subject, ['invoice.edit', 'invoice.view'], { mode: 'any' })
 */
export function can(
  subject: Subject,
  required: Permission | Permission[],
  options?: CanOptions,
): boolean {
  const mode = options?.mode ?? 'all';
  const requiredList = Array.isArray(required) ? required : [required];

  if (requiredList.length === 0) return true;

  const check = (permission: Permission): boolean =>
    subjectHasPermission(subject.permissions, permission);

  return mode === 'all' ? requiredList.every(check) : requiredList.some(check);
}
