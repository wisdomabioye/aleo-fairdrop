import { useQueryClient } from '@tanstack/react-query';
import { Spinner } from '@/components';
import {
  useCallerStatus,
  AUCTION_CALLERS,
  type UtilityKey,
} from '../../hooks/useCallerStatus';
import { UTILITIES } from './constants';
import { AuctionRow } from './AuctionRow';

export function AuthorizationPanel() {
  const queryClient             = useQueryClient();
  const { data: grid, isLoading } = useCallerStatus();

  if (isLoading) return <div className="flex justify-center py-8"><Spinner className="h-5 w-5" /></div>;
  if (!grid)     return <p className="text-sm text-muted-foreground">Could not load authorization status.</p>;

  const rowStatus = (address: string): Record<UtilityKey, boolean> => ({
    gate:  grid.gate[address]  ?? false,
    ref:   grid.ref[address]   ?? false,
    proof: grid.proof[address] ?? false,
    vest:  grid.vest[address]  ?? false,
  });

  return (
    <div className="space-y-1">
      {/* Column headers */}
      <div className="flex items-center gap-3 pb-2 border-b border-border/50">
        <div className="w-24 shrink-0" />
        <div className="flex gap-4 flex-1">
          {UTILITIES.map((u) => (
            <p key={u.key} className="min-w-[44px] text-[11px] font-semibold text-muted-foreground">{u.label}</p>
          ))}
        </div>
      </div>

      {AUCTION_CALLERS.map((a) => (
        <AuctionRow
          key={a.address}
          auctionLabel={a.label}
          auctionAddress={a.address}
          status={rowStatus(a.address)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['callerStatus'] })}
        />
      ))}
    </div>
  );
}
