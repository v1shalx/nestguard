import { describe, it, expect } from 'vitest';
import { can } from '../../src/core/engine.js';
import type { Subject } from '../../src/core/types.js';

/** Build a minimal Subject for tests — only set what the test needs. */
function makeSubject(permissions: string[]): Subject {
  return {
    id: 'user-1',
    roles: [],
    permissions: new Set(permissions),
  };
}

describe('can()', () => {
  describe('fail closed', () => {
    it('denies when subject has no permissions', () => {
      expect(can(makeSubject([]), 'invoice.edit')).toBe(false);
    });

    it('denies when subject lacks the required permission', () => {
      expect(can(makeSubject(['profile.read']), 'invoice.edit')).toBe(false);
    });
  });

  describe('single permission', () => {
    it('allows when subject holds the exact permission', () => {
      expect(can(makeSubject(['invoice.edit']), 'invoice.edit')).toBe(true);
    });

    it('allows when subject holds a wildcard covering the permission', () => {
      expect(can(makeSubject(['invoice.*']), 'invoice.edit')).toBe(true);
    });

    it('allows when subject is superuser', () => {
      expect(can(makeSubject(['*']), 'invoice.edit')).toBe(true);
    });

    it('allows via scope elevation (.all satisfies .own)', () => {
      expect(can(makeSubject(['invoice.edit.all']), 'invoice.edit.own')).toBe(true);
    });

    it('denies when subject only holds .own but .all is required', () => {
      expect(can(makeSubject(['invoice.edit.own']), 'invoice.edit.all')).toBe(false);
    });
  });

  describe('AND mode (default)', () => {
    it('allows when subject holds all required permissions', () => {
      const subject = makeSubject(['invoice.edit', 'invoice.view']);
      expect(can(subject, ['invoice.edit', 'invoice.view'])).toBe(true);
    });

    it('denies when subject is missing one of the required permissions', () => {
      const subject = makeSubject(['invoice.edit']);
      expect(can(subject, ['invoice.edit', 'invoice.view'])).toBe(false);
    });

    it('defaults to AND mode when no options provided', () => {
      const subject = makeSubject(['invoice.edit']);
      // AND mode: both required, only one present → deny
      expect(can(subject, ['invoice.edit', 'invoice.view'])).toBe(false);
    });

    it('explicit mode: all behaves the same as default', () => {
      const subject = makeSubject(['invoice.edit', 'invoice.view']);
      expect(can(subject, ['invoice.edit', 'invoice.view'], { mode: 'all' })).toBe(true);
    });
  });

  describe('OR mode', () => {
    it('allows when subject holds at least one of the required permissions', () => {
      const subject = makeSubject(['invoice.view']);
      expect(can(subject, ['invoice.edit', 'invoice.view'], { mode: 'any' })).toBe(true);
    });

    it('denies when subject holds none of the required permissions', () => {
      const subject = makeSubject(['profile.read']);
      expect(can(subject, ['invoice.edit', 'invoice.view'], { mode: 'any' })).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns true for an empty required list (no permissions needed)', () => {
      expect(can(makeSubject([]), [])).toBe(true);
    });

    it('accepts a single string (not array) as required', () => {
      expect(can(makeSubject(['invoice.edit']), 'invoice.edit')).toBe(true);
    });

    it('works with tenantId on the subject', () => {
      const subject: Subject = {
        id: 'user-1',
        tenantId: 'tenant-abc',
        roles: ['manager'],
        permissions: new Set(['invoice.edit']),
      };
      expect(can(subject, 'invoice.edit')).toBe(true);
    });
  });
});
