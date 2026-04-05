import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    'primitives':          'src/primitives/index.ts',
    'contracts':           'src/contracts/index.ts',
    'contracts/auctions':  'src/contracts/auctions/index.ts',
    'contracts/utilities': 'src/contracts/utilities/index.ts',
    'domain':              'src/domain/index.ts',
    'api':                 'src/api/index.ts',
    'indexer':             'src/indexer/index.ts',
  },
  format:    'esm',
  dts:       true,
  sourcemap: true,
  clean:     true,
  outDir:    'dist',
});
