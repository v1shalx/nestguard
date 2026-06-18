// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  // ── Ignored paths ──────────────────────────────────────────────────────────
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'examples/**',
      '*.config.ts',
      '*.config.mjs',
    ],
  },

  // ── Base rules ─────────────────────────────────────────────────────────────
  eslint.configs.recommended,

  // ── TypeScript rules ───────────────────────────────────────────────────────
  ...tseslint.configs.recommended,

  // ── Disable rules that conflict with Prettier ──────────────────────────────
  prettierConfig,

  // ── Project-wide overrides ─────────────────────────────────────────────────
  {
    rules: {
      // Warn rather than error: `any` is sometimes unavoidable (e.g. NestJS
      // ExecutionContext internals). Any usage must have a justifying comment.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Allow omitting return types on simple functions — inference is clear
      // enough there, and forcing annotations on every arrow function is noisy.
      '@typescript-eslint/explicit-module-boundary-types': 'off',

      // Unused vars are always a bug; underscore-prefix opt-out for intentional
      // discards (e.g. `_req` in test stubs).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // ── Core purity enforcement ────────────────────────────────────────────────
  // This is the most important rule in the whole config.
  // src/core/ must stay framework-agnostic so it can be unit-tested without
  // NestJS and (in v2) ported to other adapters. Any @nestjs import here is
  // a hard error, not a warning.
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@nestjs/*'],
              message:
                'src/core/ must remain framework-agnostic. ' +
                'NestJS imports are forbidden here. ' +
                'Move framework-specific code to src/nestjs/ instead.',
            },
          ],
        },
      ],
    },
  },
);
