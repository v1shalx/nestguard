import { defineConfig } from 'tsup';

export default defineConfig({
  /**
   * One entry per `exports` map key in package.json.
   * The key becomes the output filename (relative to dist/).
   * Adding a new optional plugin (e.g. jwt/) means adding one line here
   * and one conditional export in package.json — nothing else changes.
   */
  entry: {
    index: 'src/index.ts',
    'nestjs/index': 'src/nestjs/index.ts',
    'stores/postgres/index': 'src/stores/postgres/index.ts',
    'stores/redis-cache/index': 'src/stores/redis-cache/index.ts',
  },

  // Produce both CommonJS (.js) and ESM (.mjs) from the same source.
  // Consumers get the right format automatically via the exports map.
  format: ['cjs', 'esm'],

  // Generate .d.ts declarations alongside each output chunk.
  dts: true,

  // Wipe dist/ before each build to prevent stale artefacts.
  clean: true,

  // Source maps aid debugging in consumer projects.
  sourcemap: true,

  // Disable code splitting — each entry is an independent public API surface;
  // shared chunks would complicate the package's import paths for consumers.
  splitting: false,

  // Tree-shake dead code from the output.
  treeshake: true,

  // External: NestJS is a peerDependency and must never be bundled.
  external: ['@nestjs/common', '@nestjs/core', 'reflect-metadata'],
});
