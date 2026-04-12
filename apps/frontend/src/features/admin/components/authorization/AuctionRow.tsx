import { useState, useMemo } from 'react';
import { Button } from '@/components';
import { computeAllowedCallerOpHash } from '@fairdrop/sdk/hash';
import { UtilityAuthCard } from './UtilityAuthCard';
import { useAuthSession } from './useAuthSession';
import { UTILITIES } from './constants';
import type { UtilityKey } from '../../hooks/useCallerStatus';

interface AuctionRowProps {
  auctionLabel:   string;
  auctionAddress: string;
  status:         Record<UtilityKey, boolean>;
  onSuccess:      () => void;
}

interface OpEntry {
  utility:   (typeof UTILITIES)[number];
  opHash:    string;
  opNonce:   bigint;
  requestId: bigint;
}

export function AuctionRow({ auctionLabel, auctionAddress, status, onSuccess }: AuctionRowProps) {
  const [open, setOpen] = useState(false);

  const missing     = useMemo(() => UTILITIES.filter((u) => !status[u.key]), [status]);
  const missingKeys = useMemo(() => missing.map((u) => u.key), [missing]);
  const allAuthorized = missing.length === 0;

  const { nonces, sigs, setSigs, clear } = useAuthSession(auctionAddress, missingKeys);

  // Defer WASM hashing until expanded.
  const opEntries = useMemo<OpEntry[]>(() => {
    if (!open || missing.length === 0) return [];
    return missing.map((u) => {
      const n = nonces[u.key];
      if (!n) return null;
      const opHash = computeAllowedCallerOpHash(auctionAddress, true, n.opNonce);
      return { utility: u, opHash, opNonce: n.opNonce, requestId: n.requestId };
    }).filter((e): e is OpEntry => e !== null);
  }, [open, missing, nonces, auctionAddress]);

  return (
    <div className="space-y-3 border-b border-border/50 pb-3 last:border-0 last:pb-0">
      {/* Header row */}
      <div className="flex items-center gap-3 flex-wrap">
        <p className="w-24 shrink-0 text-sm font-medium">{auctionLabel}</p>
        <div className="flex gap-4 flex-1">
          {UTILITIES.map((u) => (
            <div key={u.key} className="flex flex-col items-center gap-0.5 min-w-[44px]">
              <span className="text-[10px] text-muted-foreground">{u.label}</span>
              <span className={`text-sm font-semibold ${status[u.key] ? 'text-emerald-500' : 'text-destructive'}`}>
                {status[u.key] ? '✓' : '✗'}
              </span>
            </div>
          ))}
        </div>
        <div className="shrink-0">
          {allAuthorized ? (
            <span className="text-xs text-muted-foreground">All authorized</span>
          ) : (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen((o) => !o)}>
              {open ? 'Cancel' : `${missing.length} missing`}
            </Button>
          )}
        </div>
      </div>

      {/* Expanded: independent per-utility cards */}
      {open && !allAuthorized && (
        <div className="space-y-2">
          {opEntries.map((entry) => {
            const utilitySigs = sigs[entry.utility.key];
            if (!utilitySigs) return null;
            return (
              <UtilityAuthCard
                key={entry.utility.key}
                utilityKey={entry.utility.key}
                label={entry.utility.label}
                opHash={entry.opHash}
                requestId={entry.requestId}
                opNonce={entry.opNonce}
                auctionAddress={auctionAddress}
                sigs={utilitySigs}
                onChange={(v) => setSigs(entry.utility.key, v)}
                onSuccess={onSuccess}
              />
            );
          })}
          <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={clear}>
            Reset all signatures
          </Button>
        </div>
      )}
    </div>
  );
}
