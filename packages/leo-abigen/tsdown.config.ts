import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index:   'src/index.ts',
    adapters: 'src/runtime/adapters.ts',
    codegen: 'src/codegen/index.ts',
  },
  format:    'esm',
  dts:       true,
  sourcemap: true,
  clean:     true,
  outDir:    'dist',
  deps: {
    neverBundle: ['@fairdrop/types', '@provablehq/aleo-types'],
  },
});
