import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Human-readable output with per-test results
    reporter: 'verbose',

 

    // Istanbul-based coverage via V8 — faster than Babel instrumentation
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        // Entry-point barrels contain no logic to cover
        'src/index.ts',
        'src/core/index.ts',
        'src/nestjs/index.ts',
        'src/stores/postgres/index.ts',
        'src/stores/redis-cache/index.ts',
        'src/jwt/index.ts',
      ],
    },
  },
});
