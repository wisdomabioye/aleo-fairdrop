import { fetchTokenInfo, fetchTokenBalance } from '@fairdrop/sdk/token-registry';
import type { CheckFn } from './types.js';

export function buildTokenGateCheck(tokenId: string, minBalance: bigint): CheckFn {
  return async (address) => {
    const info = await fetchTokenInfo(tokenId);
    if (!info) return false;

    const balance = await fetchTokenBalance(address, tokenId, info);
    return balance !== null && balance.amount >= minBalance;
  };
}
