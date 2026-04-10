import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components';
import { useTokenInfo } from '@/shared/hooks/useTokenInfo';
import { usePool } from '../hooks/usePool';
import { SlippageSettings } from '../components/SlippageSettings';
import { TokenPairDisplay } from '../components/TokenPairDisplay';
import { AddLiquidityForm } from '../forms/AddLiquidityForm';
import type { TokenDisplay } from '@/config/well-known-tokens';

export function CreatePoolPage() {
  const [tokenA, setTokenA] = useState<TokenDisplay | null>(null);
  const [tokenB, setTokenB] = useState<TokenDisplay | null>(null);
  const [slippageBps, setSlippageBps] = useState(100);

  const tokenAId = tokenA?.tokenId ?? null;
  const tokenBId = tokenB?.tokenId ?? null;

  const { data: pool, isLoading: poolLoading } = usePool(tokenAId, tokenBId);
  const { data: tokenAMeta } = useTokenInfo(tokenAId);
  const { data: tokenBMeta } = useTokenInfo(tokenBId);

  const existingPool = !poolLoading && pool !== null && pool !== undefined;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Create Pool</h1>
        <SlippageSettings value={slippageBps} onChange={setSlippageBps} />
      </div>

      <TokenPairDisplay
        tokenA={tokenA}
        tokenB={tokenB}
        onChangeTokenA={setTokenA}
        onChangeTokenB={setTokenB}
      />

      {existingPool ? (
        <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
          <CardContent className="space-y-2 p-4 text-center">
            <p className="text-sm text-muted-foreground">
              A pool for this pair already exists.
            </p>
            <Link
              to={`/dex/liquidity?in=${tokenAId ?? ''}&out=${tokenBId ?? ''}`}
              className="text-sm font-medium text-sky-400 underline underline-offset-4"
            >
              Add liquidity instead
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
          <CardContent className="space-y-3 p-4">
            <AddLiquidityForm
              tokenA={tokenAId}
              tokenB={tokenBId}
              tokenAMeta={tokenAMeta ?? null}
              tokenBMeta={tokenBMeta ?? null}
              pool={null}
              poolLoading={poolLoading}
              slippageBps={slippageBps}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
