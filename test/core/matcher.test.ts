import { describe, it, expect } from 'vitest';
import { matchesPermission, subjectHasPermission } from '../../src/core/matcher.js';

describe('matchesPermission', () => {
  describe('Rule 1 — exact match', () => {
    it('matches identical permission strings', () => {
      expect(matchesPermission('invoice.edit', 'invoice.edit')).toBe(true);
    });

    it('does not match different permission strings', () => {
      expect(matchesPermission('invoice.edit', 'invoice.view')).toBe(false);
    });

    it('is case-sensitive', () => {
      expect(matchesPermission('Invoice.Edit', 'invoice.edit')).toBe(false);
    });
  });

  describe('Rule 2 — superuser wildcard', () => {
    it('* matches any permission', () => {
      expect(matchesPermission('*', 'invoice.edit')).toBe(true);
      expect(matchesPermission('*', 'profile.read')).toBe(true);
      expect(matchesPermission('*', 'invoice.edit.own')).toBe(true);
    });

    it('* matches itself', () => {
      expect(matchesPermission('*', '*')).toBe(true);
    });
  });

  describe('Rule 3 — prefix wildcard', () => {
    it('invoice.* matches invoice.edit', () => {
      expect(matchesPermission('invoice.*', 'invoice.edit')).toBe(true);
    });

    it('invoice.* matches invoice.view', () => {
      expect(matchesPermission('invoice.*', 'invoice.view')).toBe(true);
    });

    it('invoice.* matches multi-level invoice.edit.own', () => {
      expect(matchesPermission('invoice.*', 'invoice.edit.own')).toBe(true);
    });

    it('invoice.* does not match profile.read', () => {
      expect(matchesPermission('invoice.*', 'profile.read')).toBe(false);
    });

    it('invoice.* does not partially match invoiceadmin (no dot boundary)', () => {
      expect(matchesPermission('invoice.*', 'invoiceadmin')).toBe(false);
    });

    it('invoice.edit.* matches invoice.edit.own', () => {
      expect(matchesPermission('invoice.edit.*', 'invoice.edit.own')).toBe(true);
    });

    it('invoice.edit.* does not match invoice.view', () => {
      expect(matchesPermission('invoice.edit.*', 'invoice.view')).toBe(false);
    });
  });

  describe('Rule 4 — scope elevation (.all → .own)', () => {
    it('invoice.edit.all satisfies invoice.edit.own', () => {
      expect(matchesPermission('invoice.edit.all', 'invoice.edit.own')).toBe(true);
    });

    it('invoice.edit.own does NOT satisfy invoice.edit.all', () => {
      expect(matchesPermission('invoice.edit.own', 'invoice.edit.all')).toBe(false);
    });

    it('.all does not satisfy .own for a different base permission', () => {
      expect(matchesPermission('invoice.edit.all', 'invoice.view.own')).toBe(false);
    });

    it('.all does not satisfy .own across different namespaces', () => {
      expect(matchesPermission('profile.edit.all', 'invoice.edit.own')).toBe(false);
    });
  });
});

describe('subjectHasPermission', () => {
  it('returns false for an empty permission set (fail closed)', () => {
    expect(subjectHasPermission(new Set(), 'invoice.edit')).toBe(false);
  });

  it('returns true when the set contains an exact match', () => {
    const perms = new Set(['profile.read', 'invoice.edit', 'invoice.view']);
    expect(subjectHasPermission(perms, 'invoice.edit')).toBe(true);
  });

  it('returns true when the set contains a wildcard that covers the required', () => {
    const perms = new Set(['invoice.*']);
    expect(subjectHasPermission(perms, 'invoice.edit')).toBe(true);
  });

  it('returns true when the set contains the superuser wildcard', () => {
    const perms = new Set(['*']);
    expect(subjectHasPermission(perms, 'anything.at.all')).toBe(true);
  });

  it('returns false when no permission in the set matches', () => {
    const perms = new Set(['profile.read', 'profile.edit']);
    expect(subjectHasPermission(perms, 'invoice.edit')).toBe(false);
  });
});
