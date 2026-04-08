/**
 * Price curve chart for Dutch, Ascending, and LBP auctions.
 * All formulas are computed client-side from AuctionView.params — no API calls.
 */

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import {
  dutchPriceCurve,
  ascendingPriceCurve,
  lbpPriceCurve,
} from '@fairdrop/sdk/price';
import { AuctionType } from '@fairdrop/types/domain';
import type { AuctionView } from '@fairdrop/types/domain';
import { useBlockHeight } from '@/shared/hooks/useBlockHeight';

interface Props {
  auction: AuctionView;
}

const TICK_STYLE = { fill: 'currentColor', fontSize: 10 } as const;

export function PriceCurveChart({ auction }: Props) {
  const { data: currentBlock = 0 } = useBlockHeight();
  const { params, startBlock } = auction;
  const endBlock = auction.effectiveEndBlock ?? auction.endBlock;

  // ── Generate curve data ───────────────────────────────────────────────────

  let rawPoints: Array<{ block: number; price: bigint }> = [];
  let lineLabel = 'Price';
  let isTheoretical = false;

  if (params.type === AuctionType.Dutch) {
    rawPoints = dutchPriceCurve(params, startBlock, endBlock);
    lineLabel = 'Dutch price';
  } else if (params.type === AuctionType.Ascending) {
    rawPoints = ascendingPriceCurve(params, startBlock, endBlock);
    lineLabel = 'Ascending price';
  } else if (params.type === AuctionType.Lbp) {
    rawPoints     = lbpPriceCurve(params, startBlock, endBlock);
    lineLabel     = 'LBP ceiling price';
    isTheoretical = true;
  } else {
    return null;
  }

  const data = rawPoints.map((p) => ({ block: p.block, price: Number(p.price) }));

  const lineColor =
    params.type === AuctionType.Dutch     ? '#3b82f6' :
    params.type === AuctionType.Ascending ? '#f97316' :
                                            '#f59e0b';

  return (
    // text-muted-foreground sets CSS `color` so SVG fill="currentColor" resolves correctly
    <div className="space-y-2 text-muted-foreground">
      {isTheoretical && (
        <p className="text-[11px]">
          Theoretical ceiling — assumes no bids placed. Actual price decreases as supply fills.
        </p>
      )}

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.12} />

          <XAxis
            dataKey="block"
            tickFormatter={(v: number) => v.toLocaleString()}
            tick={TICK_STYLE}
            axisLine={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
            tickLine={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
          />
          <YAxis
            tickFormatter={(v: number) => formatMicrocredits(BigInt(v))}
            tick={TICK_STYLE}
            axisLine={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
            tickLine={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
            width={76}
          />

          <Tooltip
            formatter={(v: number) => [formatMicrocredits(BigInt(v)), lineLabel]}
            labelFormatter={(b: number) => `Block ${b.toLocaleString()}`}
            contentStyle={{
              background:   'var(--background)',
              border:       '1px solid color-mix(in oklch, currentColor 20%, transparent)',
              borderRadius: '8px',
              fontSize:     12,
              color:        'var(--foreground)',
            }}
          />

          {/* Current block marker */}
          {currentBlock >= startBlock && currentBlock <= endBlock && (
            <ReferenceLine
              x={currentBlock}
              stroke="#0ea5e9"
              strokeOpacity={0.7}
              strokeDasharray="4 3"
              label={({ viewBox }: { viewBox?: { x?: number; y?: number } }) => (
                <text
                  x={(viewBox?.x ?? 0) + 4}
                  y={(viewBox?.y ?? 4) + 4}
                  fill="currentColor"
                  fontSize={10}
                >
                  Now
                </text>
              )}
            />
          )}

          <Line
            type={params.type === AuctionType.Lbp ? 'linear' : 'stepAfter'}
            dataKey="price"
            name={lineLabel}
            stroke={lineColor}
            dot={false}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
