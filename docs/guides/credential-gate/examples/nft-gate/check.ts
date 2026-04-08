/**
 * NFT / token-gate check module for credential-signer.
 *
 * Requires the bidder to hold a minimum public balance of REQUIRED_TOKEN_ID.
 *
 * USAGE:
 *   1. Copy this file to the credential-signer root directory (next to .env), NOT inside src/.
 *   2. Set CHECK_STRATEGY=custom and CHECK_MODULE=./nft-gate-check.ts in .env.
 *   3. Set REQUIRED_TOKEN_ID to the on-chain token field ID.
 *
 * fetchTokenInfo and fetchTokenBalance are available because credential-signer
 * initialises @provablehq/sdk WASM at startup before any check function runs.
 */
import { fetchTokenInfo, fetchTokenBalance } from '@fairdrop/sdk/token-registry';

const TOKEN_ID    = process.env.REQUIRED_TOKEN_ID;
const MIN_BALANCE = BigInt(process.env.MIN_BALANCE ?? '1');

if (!TOKEN_ID) {
  throw new Error('[nft-gate] REQUIRED_TOKEN_ID is not set');
}

const check = async (address: string, _auctionId: string): Promise<boolean> => {
  const info = await fetchTokenInfo(TOKEN_ID);
  if (!info) {
    // Token not found in token_registry.aleo — deny all requests
    return false;
  }

  const balance = await fetchTokenBalance(address, TOKEN_ID, info);
  return balance !== null && balance.amount >= MIN_BALANCE;
};

export default check;
