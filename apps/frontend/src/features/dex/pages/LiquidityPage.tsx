import { useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Card, CardContent, Tabs, TabsList, TabsTrigger, TabsContent } from '@/components';
import { useTokenMetadata } from '@/shared/hooks/useTokenMetadata';
import { usePool } from '../hooks/usePool';
import { SlippageSettings } from '../components/SlippageSettings';
import { TokenPairDisplay } from '../components/TokenPairDisplay';
import { PoolStatsCard } from '../components/PoolStatsCard';
import { LpPositionCard } from '../components/LpPositionCard';
import { AddLiquidityForm } from '../forms/AddLiquidityForm';
import { RemoveLiquidityForm } from '../forms/RemoveLiquidityForm';
import type { TokenDisplay } from '@/config/well-known-tokens';

export function LiquidityPage() {
  const { address } = useWallet();

  const [tokenA, setTokenA] = useState<TokenDisplay | null>(null);
  const [tokenB, setTokenB] = useState<TokenDisplay | null>(null);
  const [slippageBps, setSlippageBps] = useState(100);

  const tokenAId = tokenA?.tokenId ?? null;
  const tokenBId = tokenB?.tokenId ?? null;

  const { data: pool, isLoading: poolLoading } = usePool(tokenAId, tokenBId);
  const { data: tokenAMeta } = useTokenMetadata(tokenAId);
  const { data: tokenBMeta } = useTokenMetadata(tokenBId);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Liquidity</h1>
        <SlippageSettings value={slippageBps} onChange={setSlippageBps} />
      </div>

      <TokenPairDisplay
        tokenA={tokenA}
        tokenB={tokenB}
        onChangeTokenA={setTokenA}
        onChangeTokenB={setTokenB}
      />

      <Tabs defaultValue="add">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="add">Add</TabsTrigger>
          <TabsTrigger value="remove">Remove</TabsTrigger>
        </TabsList>

        <TabsContent value="add">
          <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
            <CardContent className="space-y-3 p-4">
              <AddLiquidityForm
                tokenA={tokenAId}
                tokenB={tokenBId}
                tokenAMeta={tokenAMeta ?? null}
                tokenBMeta={tokenBMeta ?? null}
                pool={pool ?? null}
                poolLoading={poolLoading}
                slippageBps={slippageBps}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="remove">
          <Card className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
            <CardContent className="space-y-3 p-4">
              <RemoveLiquidityForm
                tokenA={tokenAId}
                tokenB={tokenBId}
                tokenAMeta={tokenAMeta ?? null}
                tokenBMeta={tokenBMeta ?? null}
                pool={pool ?? null}
                slippageBps={slippageBps}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {pool && address && (
        <LpPositionCard
          address={address}
          pool={pool}
          tokenA={tokenAMeta ?? null}
          tokenB={tokenBMeta ?? null}
        />
      )}

      {pool && (
        <PoolStatsCard
          pool={pool}
          tokenA={tokenAMeta ?? null}
          tokenB={tokenBMeta ?? null}
        />
      )}
    </div>
  );
}
