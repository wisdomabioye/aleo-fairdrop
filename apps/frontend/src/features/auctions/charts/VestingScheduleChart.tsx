/**
 * Vesting unlock curve for any auction with vestEnabled = true.
 * Rendered on the Earn/Claim tab. User types their allocation to see their schedule.
 * Base block = endedAtBlock (actual close) or effectiveEndBlock/endBlock as fallback.
 */

import { useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { Input } from '@/components/ui/input';
import type { AuctionView } from '@fairdrop/types/domain';

interface Props {
  auction: AuctionView;
}

const TICK_STYLE = { fill: 'currentColor', fontSize: 10 } as const;

function buildCurve(
  baseBlock:  number,
  cliffBlocks: number,
  endBlocks:  number,
  allocation: number,
): Array<{ block: number; tokens: number }> {
  const cliffBlock = baseBlock + cliffBlocks;
  const vestEnd    = baseBlock + endBlocks;
  const duration   = endBlocks - cliffBlocks;
  const totalSpan  = endBlocks;
  const step       = Math.max(1, Math.floor(totalSpan / 40));
  const points: Array<{ block: number; tokens: number }> = [];

  for (let b = baseBlock; b <= vestEnd; b += step) {
    let tokens = 0;
    if (b >= cliffBlock && duration > 0) {
      tokens = Math.min(allocation, Math.floor(allocation * (b - cliffBlock) / duration));
    }
    points.push({ block: b, tokens });
  }

  if (points[points.length - 1]?.block !== vestEnd) {
    points.push({ block: vestEnd, tokens: allocation });
  }

  return points;
}

export function VestingScheduleChart({ auction }: Props) {
  const [allocationStr, setAllocationStr] = useState('');

  if (!auction.vestEnabled) return null;

  const baseBlock   = auction.endedAtBlock ?? auction.effectiveEndBlock ?? auction.endBlock;
  const cliffBlocks = auction.vestCliffBlocks;
  const endBlocks   = auction.vestEndBlocks;
  const allocation  = Math.max(0, Math.floor(Number(allocationStr || 0)));

  const data = buildCurve(baseBlock, cliffBlocks, endBlocks, allocation > 0 ? allocation : 100);

  const cliffBlock = baseBlock + cliffBlocks;
  const vestEnd    = baseBlock + endBlocks;
  const isPreview  = allocation === 0;

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-background/50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Vesting Schedule
      </p>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Your allocation (tokens)</label>
        <Input
          type="number"
          min="0"
          step="1"
          placeholder="e.g. 1000"
          value={allocationStr}
          onChange={(e) => setAllocationStr(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      {isPreview && (
        <p className="text-[11px] text-muted-foreground">
          Enter your allocation above to see your personalised schedule. Preview shows shape only.
        </p>
      )}

      {/* text-muted-foreground sets CSS `color` so fill="currentColor" resolves correctly */}
      <div className="text-muted-foreground">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="vestGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.12} />

            <XAxis
              dataKey="block"
              tickFormatter={(v: number) => v.toLocaleString()}
              tick={TICK_STYLE}
              axisLine={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
              tickLine={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
            />
            <YAxis
              tickFormatter={(v: number) => v.toLocaleString()}
              tick={TICK_STYLE}
              axisLine={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
              tickLine={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
              width={60}
            />

            <Tooltip
              formatter={(v: number) => [`${v.toLocaleString()} tokens`, 'Unlocked']}
              labelFormatter={(b: number) => `Block ${b.toLocaleString()}`}
              contentStyle={{
                background:   'var(--background)',
                border:       '1px solid color-mix(in oklch, currentColor 20%, transparent)',
                borderRadius: '8px',
                fontSize:     12,
                color:        'var(--foreground)',
              }}
            />

            {cliffBlocks > 0 && (
              <ReferenceLine
                x={cliffBlock}
                stroke="currentColor"
                strokeOpacity={0.3}
                strokeDasharray="4 3"
                label={({ viewBox }: { viewBox?: { x?: number; y?: number } }) => (
                  <text
                    x={(viewBox?.x ?? 0) + 4}
                    y={(viewBox?.y ?? 4) + 4}
                    fill="currentColor"
                    fontSize={10}
                  >
                    Cliff
                  </text>
                )}
              />
            )}

            <ReferenceLine
              x={vestEnd}
              stroke="#22c55e"
              strokeOpacity={0.5}
              strokeDasharray="4 3"
              label={({ viewBox }: { viewBox?: { x?: number; y?: number } }) => (
                <text
                  x={(viewBox?.x ?? 0) + 4}
                  y={(viewBox?.y ?? 4) + 4}
                  fill="currentColor"
                  fontSize={10}
                >
                  Fully vested
                </text>
              )}
            />

            <Area
              type="linear"
              dataKey="tokens"
              stroke="#22c55e"
              strokeWidth={2}
              fill="url(#vestGradient)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {cliffBlocks > 0 && (
          <span>Cliff: <span className="text-foreground">{cliffBlocks.toLocaleString()} blocks</span></span>
        )}
        <span>Full vest: <span className="text-foreground">{endBlocks.toLocaleString()} blocks after close</span></span>
      </div>
    </div>
  );
}
