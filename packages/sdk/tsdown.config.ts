import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    parse:        'src/parse/index.ts',
    credits:      'src/credits/index.ts',
    format:       'src/format/index.ts',
    cache:        'src/cache/index.ts',
    client:       'src/client.ts',
    'token-registry': 'src/token-registry/index.ts',
    constants:    'src/constants.ts',
    hash:         'src/hash/index.ts',
    chain:        'src/chain/index.ts',
    transactions: 'src/transactions/index.ts',
    multisig:     'src/multisig/index.ts',
    records:      'src/records/index.ts',
  },
  format:    'esm',
  dts:       true,
  sourcemap: true,
  clean:     true,
  outDir:    'dist',
  deps: { neverBundle: ['@fairdrop/types', '@fairdrop/config', '@provablehq/sdk'] },
});
