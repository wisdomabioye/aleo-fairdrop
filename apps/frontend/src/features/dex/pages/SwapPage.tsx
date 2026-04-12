import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components';
import { useTokenMetadata } from '@/shared/hooks/useTokenMetadata';
import { usePool } from '../hooks/usePool';
import { SlippageSettings } from '../components/SlippageSettings';
import { TokenSearchCombobox } from '../components/TokenSearchCombobox';
import { PoolStatsCard } from '../components/PoolStatsCard';
import { SwapForm } from '../forms/SwapForm';
import type { TokenDisplay } from '@/config/well-known-tokens';

export function SwapPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Lifted state: token pair + slippage
  const [tokenIn,  setTokenInRaw]  = useState<TokenDisplay | null>(null);
  const [tokenOut, setTokenOutRaw] = useState<TokenDisplay | null>(null);
  const [slippageBps, setSlippageBps] = useState(100); // 1% default

  // URL param pre-selection on mount
  const [initialized, setInitialized] = useState(false);
  const urlIn  = searchParams.get('in');
  const urlOut = searchParams.get('out');

  // Resolve URL params to TokenDisplay via useTokenMetadata
  const { data: urlInMeta }  = useTokenMetadata(urlIn && !initialized ? urlIn : undefined);
  const { data: urlOutMeta } = useTokenMetadata(urlOut && !initialized ? urlOut : undefined);

  if (!initialized && (urlInMeta || urlOutMeta || (!urlIn && !urlOut))) {
    if (urlInMeta && !tokenIn)  setTokenInRaw(urlInMeta);
    if (urlOutMeta && !tokenOut) setTokenOutRaw(urlOutMeta);
    setInitialized(true);
  }

  const setTokenIn = useCallback((t: TokenDisplay) => {
    setTokenInRaw(t);
    const p = new URLSearchParams(searchParams);
    p.set('in', t.tokenId);
    setSearchParams(p, { replace: true });
  }, [searchParams, setSearchParams]);

  const setTokenOut = useCallback((t: TokenDisplay) => {
    setTokenOutRaw(t);
    const p = new URLSearchParams(searchParams);
    p.set('out', t.tokenId);
    setSearchParams(p, { replace: true });
  }, [searchParams, setSearchParams]);

  // Shared pool query
  const tokenInId  = tokenIn?.tokenId ?? null;
  const tokenOutId = tokenOut?.tokenId ?? null;
  const { data: pool, isLoading: poolLoading } = usePool(tokenInId, tokenOutId);

  // Token metadata (passed as props to form)
  const { data: tokenInMeta }  = useTokenMetadata(tokenInId);
  const { data: tokenOutMeta } = useTokenMetadata(tokenOutId);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Swap</h1>
        <SlippageSettings value={slippageBps} onChange={setSlippageBps} />
      </div>

      <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
        <CardContent className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-2">
            <TokenSearchCombobox
              token={tokenIn}
              onChange={setTokenIn}
              exclude={tokenOutId}
              label="From"
            />
            <TokenSearchCombobox
              token={tokenOut}
              onChange={setTokenOut}
              exclude={tokenInId}
              label="To"
            />
          </div>

          <SwapForm
            tokenIn={tokenInId}
            tokenOut={tokenOutId}
            pool={pool ?? null}
            poolLoading={poolLoading}
            slippageBps={slippageBps}
            tokenInMeta={tokenInMeta ?? null}
            tokenOutMeta={tokenOutMeta ?? null}
          />
        </CardContent>
      </Card>

      {pool && (
        <PoolStatsCard
          pool={pool}
          tokenA={tokenInMeta ?? null}
          tokenB={tokenOutMeta ?? null}
        />
      )}
    </div>
  );
}
