import { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Skeleton } from '@/components';
import { AUCTION_REGISTRY } from '@/features/auctions/registry';
import { AUCTION_TYPE_COLOR } from '@/features/auctions/constants/typeColors';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { AuctionType } from '@fairdrop/types/domain';
import type { AuctionTypeMetrics } from '@fairdrop/types/api';
import { useAuctionTypeMetrics } from '../hooks/useAnalytics';

type SortKey = 'total' | 'successRate' | 'avgFillPct' | 'avgBids' | 'totalVolume';

function fmt(val: number | null, type: 'pct' | 'num' | 'vol', raw?: string): string {
  if (val == null) return '—';
  if (type === 'pct') return `${(val * 100).toFixed(1)}%`;
  if (type === 'vol') return formatMicrocredits(BigInt(raw ?? '0'));
  return val.toFixed(1);
}

function sortMetrics(
  data: AuctionTypeMetrics[],
  key: SortKey,
  dir: 'asc' | 'desc',
): AuctionTypeMetrics[] {
  return [...data].sort((a, b) => {
    let av: number, bv: number;
    if (key === 'totalVolume') {
      av = Number(a.totalVolume);
      bv = Number(b.totalVolume);
    } else {
      av = (a[key] as number | null) ?? -1;
      bv = (b[key] as number | null) ?? -1;
    }
    return dir === 'desc' ? bv - av : av - bv;
  });
}

interface HeaderCellProps {
  label: string;
  col: SortKey;
  current: SortKey;
  dir: 'asc' | 'desc';
  onSort: (col: SortKey) => void;
}

function HeaderCell({ label, col, current, dir, onSort }: HeaderCellProps) {
  const active = col === current;
  return (
    <th
      className="cursor-pointer select-none px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center justify-end gap-1">
        {label}
        {active
          ? dir === 'desc'
            ? <ChevronDown className="size-3" />
            : <ChevronUp className="size-3" />
          : <ChevronDown className="size-3 opacity-30" />}
      </span>
    </th>
  );
}

export function TypePerformanceTable() {
  const { data, isLoading } = useAuctionTypeMetrics();
  const [sortKey, setSortKey] = useState<SortKey>('totalVolume');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function handleSort(col: SortKey) {
    if (col === sortKey) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(col); setSortDir('desc'); }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
      </div>
    );
  }

  const rows = sortMetrics(data ?? [], sortKey, sortDir);

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">No auction data yet.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/40">
            <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Type
            </th>
            <HeaderCell label="Count"       col="total"       current={sortKey} dir={sortDir} onSort={handleSort} />
            <HeaderCell label="Success"     col="successRate" current={sortKey} dir={sortDir} onSort={handleSort} />
            <HeaderCell label="Avg fill"    col="avgFillPct"  current={sortKey} dir={sortDir} onSort={handleSort} />
            <HeaderCell label="Avg bids"    col="avgBids"     current={sortKey} dir={sortDir} onSort={handleSort} />
            <HeaderCell label="Total vol"   col="totalVolume" current={sortKey} dir={sortDir} onSort={handleSort} />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/20">
          {rows.map((row) => {
            const slot = AUCTION_REGISTRY[row.type as AuctionType];
            return (
              <tr key={row.type} className="hover:bg-muted/20 transition-colors">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: AUCTION_TYPE_COLOR[row.type as AuctionType] }}
                    />
                    <span className="text-sm font-medium text-foreground">
                      {slot?.label ?? row.type}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-foreground/80">
                  {row.total.toLocaleString()}
                  <span className="ml-1 text-[10px] text-muted-foreground/60">
                    ({row.clearedCount} cleared)
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-foreground/80">
                  {fmt(row.successRate, 'pct')}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-foreground/80">
                  {fmt(row.avgFillPct, 'pct')}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-foreground/80">
                  {fmt(row.avgBids, 'num')}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-medium text-foreground">
                  {row.totalVolume === '0'
                    ? '—'
                    : formatMicrocredits(BigInt(row.totalVolume))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
