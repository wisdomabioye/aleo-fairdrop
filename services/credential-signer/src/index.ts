import 'dotenv/config';
import { initializeWasm }  from '@provablehq/sdk';
import { serve }           from '@hono/node-server';
import { initAleoClient }  from '@fairdrop/sdk/client';
import { env }             from './env.js';
import { initSigning, issuerAddress } from './signing.js';
import { loadCheckFn }     from './check/loader.js';
import { createApp }       from './app.js';

// WASM must be ready before any SDK call (PrivateKey, Signature, etc.)
await initializeWasm();

initAleoClient(env.aleoRpcUrl);
initSigning(env.issuerPrivateKey);

const checkFn = await loadCheckFn({
  strategy:        env.checkStrategy,
  customModule:    env.customModule,
  allowlistSource: env.allowlistSource,
  webhookUrl:      env.webhookUrl,
  tokenGateId:     env.tokenGateId,
  tokenGateMin:    env.tokenGateMin,
});

const app = createApp(checkFn);

console.log(`[credential-signer] issuer:   ${issuerAddress()}`);
console.log(`[credential-signer] strategy: ${env.checkStrategy}`);
console.log(`[credential-signer] port:     ${env.port}`);

serve({ fetch: app.fetch, port: env.port });
