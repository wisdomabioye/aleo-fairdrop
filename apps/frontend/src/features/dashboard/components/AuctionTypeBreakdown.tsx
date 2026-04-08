import { AUCTION_REGISTRY } from '@/features/auctions/registry';
import { AuctionType } from '@fairdrop/types/domain';

const TYPE_COLOR: Record<AuctionType, string> = {
  [AuctionType.Dutch]:     '#3b82f6',
  [AuctionType.Sealed]:    '#a855f7',
  [AuctionType.Raise]:     '#22c55e',
  [AuctionType.Ascending]: '#f97316',
  [AuctionType.Lbp]:       '#f59e0b',
  [AuctionType.Quadratic]: '#f43f5e',
};

interface Props {
  breakdown: Record<string, number>;
}

export function AuctionTypeBreakdown({ breakdown }: Props) {
  const data = Object.values(AuctionType).map((type) => ({
    type,
    label: AUCTION_REGISTRY[type].label,
    count: breakdown[type] ?? 0,
    color: TYPE_COLOR[type],
  }));

  const total = data.reduce((s, d) => s + d.count, 0);
  const max   = Math.max(...data.map((d) => d.count), 1);

  if (total === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No auctions yet.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      {data.map((item) => {
        const pct = Math.round((item.count / total) * 100);
        const barW = (item.count / max) * 100;

        return (
          <div key={item.type} className="group flex items-center gap-3">
            {/* Type label */}
            <span className="w-20 shrink-0 truncate text-[11px] text-muted-foreground group-hover:text-foreground transition-colors">
              {item.label}
            </span>

            {/* Bar track */}
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${barW}%`, backgroundColor: item.color }}
              />
            </div>

            {/* Count + percentage */}
            <div className="flex w-16 shrink-0 items-center justify-end gap-1.5">
              <span className="text-xs font-semibold tabular-nums text-foreground">
                {item.count.toLocaleString()}
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground/60">
                {pct}%
              </span>
            </div>
          </div>
        );
      })}

      {/* Total footer */}
      <div className="mt-1 border-t border-border/40 pt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>Total</span>
        <span className="font-medium text-foreground">{total.toLocaleString()}</span>
      </div>
    </div>
  );
}
