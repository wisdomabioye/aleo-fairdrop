import { useState, useEffect, useCallback } from 'react';
import { useWallet }          from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Spinner, Badge } from '@/components';
import { formatMicrocredits } from '@fairdrop/sdk/credits';
import { recStr, recField, stripSuffix } from '@fairdrop/sdk/parse';
import { fetchMapping, fetchMappingBigInt } from '@/lib/mapping';
import { computeRefListKey }  from '@fairdrop/sdk/hash';
import { config }                from '@/env';
import { creditCommission, claimCommission } from '@/lib/auctionTx';
import { 
  ConnectWalletPrompt
} from '@/shared/components/wallet/ConnectWalletPrompt';
import { parseExecutionError } from '@/shared/utils/errors';
import { useTransactionTracker } from '@/providers/transaction-tracker';

// ── on-chain helpers ───────────────────────────────────────────────────────────

const REF_PROGRAM = config.programs.ref.programId;

async function fetchEarned(codeId: string): Promise<bigint> {
  return fetchMappingBigInt(REF_PROGRAM, 'earned', codeId);
}

async function fetchRefCount(codeId: string): Promise<bigint> {
  return fetchMappingBigInt(REF_PROGRAM, 'referral_count', codeId);
}

async function fetchUncreditedKeys(codeId: string, count: bigint): Promise<string[]> {
  const keys: string[] = [];
  for (let i = 0n; i < count; i++) {
    const listKey   = computeRefListKey(codeId, i);
    const bidderKey = await fetchMapping(REF_PROGRAM, 'referral_list', listKey);
    if (!bidderKey) continue;
    const rec = await fetchMapping(REF_PROGRAM, 'referral_records', bidderKey);
    if (!rec) continue;
    if (!/credited:\s*true/.test(rec)) keys.push(bidderKey);
  }
  return keys;
}

// ── types ─────────────────────────────────────────────────────────────────────

interface RefCodeStatus {
  raw:           Record<string, unknown>;
  codeId:        string;
  auctionId:     string;
  commissionBps: number;
  earned:        bigint;
  uncredited:    string[];
  loadingKeys:   boolean;
}

// ── component ─────────────────────────────────────────────────────────────────

export function ReferralCommissionsTab() {
  const { connected, requestRecords, executeTransaction } = useWallet();
  const { track } = useTransactionTracker();

  const [codes,     setCodes]     = useState<RefCodeStatus[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [crediting, setCrediting] = useState<string | null>(null); // codeId
  const [claiming,  setClaiming]  = useState<string | null>(null); // codeId
  const [errors,    setErrors]    = useState<Record<string, string>>({});

  const loadCodes = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    try {
      const recs = await (requestRecords as (p: string) => Promise<Record<string, unknown>[]>)(REF_PROGRAM);
      const parsed = (recs ?? []).map((rec) => ({
        raw:           rec,
        codeId:        recField(rec, 'code_id'),
        auctionId:     recField(rec, 'auction_id'),
        commissionBps: parseInt(stripSuffix(recStr(rec, 'commission_bps'))) || 0,
        earned:        0n,
        uncredited:    [] as string[],
        loadingKeys:   true,
      }));
      setCodes(parsed);
      setLoading(false);

      // Enrich each code with on-chain data
      await Promise.all(parsed.map(async (code, idx) => {
        const [earned, count] = await Promise.all([
          fetchEarned(code.codeId),
          fetchRefCount(code.codeId),
        ]);
        const uncredited = await fetchUncreditedKeys(code.codeId, count);
        setCodes((prev) => {
          const next = [...prev];
          if (next[idx]) next[idx] = { ...next[idx]!, earned, uncredited, loadingKeys: false };
          return next;
        });
      }));
    } catch {
      setCodes([]);
      setLoading(false);
    }
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadCodes(); }, [loadCodes]);

  async function handleCreditAll(status: RefCodeStatus) {
    const { codeId, uncredited } = status;
    setErrors((e) => ({ ...e, [codeId]: '' }));
    setCrediting(codeId);

    for (const bidderKey of uncredited) {
      try {
        const spec = creditCommission(codeId, bidderKey);
        const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
        if (result?.transactionId) track(result.transactionId, 'Credit bidder');
        setCodes((prev) => prev.map((s) =>
          s.codeId === codeId
            ? { ...s, uncredited: s.uncredited.filter((k) => k !== bidderKey) }
            : s,
        ));
      } catch (err) {
        setErrors((e) => ({ ...e, [codeId]: parseExecutionError(err) }));
        setCrediting(null);
        return;
      }
    }

    // Refresh earned after all credits
    const freshEarned = await fetchEarned(codeId);
    setCodes((prev) => prev.map((s) => s.codeId === codeId ? { ...s, earned: freshEarned } : s));
    setCrediting(null);
  }

  async function handleClaim(status: RefCodeStatus) {
    const { codeId, raw } = status;
    setErrors((e) => ({ ...e, [codeId]: '' }));
    setClaiming(codeId);

    // Re-read live earned to avoid D11 revert
    const latestEarned = await fetchEarned(codeId);
    if (latestEarned === 0n) {
      setErrors((e) => ({ ...e, [codeId]: 'Nothing to claim yet.' }));
      setClaiming(null);
      return;
    }

    const attempt = async (amount: bigint) => {
      const spec = claimCommission(raw, amount);
      return executeTransaction({ ...spec, inputs: spec.inputs as string[] });
    };

    try {
      const result = await attempt(latestEarned);
      if (result?.transactionId) track(result.transactionId, 'Claim commission');
      setCodes((prev) => prev.map((s) => s.codeId === codeId ? { ...s, earned: 0n } : s));
    } catch (err) {
      const msg = parseExecutionError(err);
      if (msg.includes('finalize_claim_commission')) {
        // Auto-retry once with a fresh read
        try {
          const retry  = await fetchEarned(codeId);
          const result2 = await attempt(retry);
          if (result2?.transactionId) track(result2.transactionId, 'Claim commission (retry)');
          setCodes((prev) => prev.map((s) => s.codeId === codeId ? { ...s, earned: 0n } : s));
        } catch (err2) {
          setErrors((e) => ({ ...e, [codeId]: parseExecutionError(err2) }));
        }
      } else {
        setErrors((e) => ({ ...e, [codeId]: msg }));
      }
    } finally {
      setClaiming(null);
    }
  }

  if (!connected) {
    return (
      <ConnectWalletPrompt message="Connect your wallet to see your referral codes." />
    );
  }

  if (loading) {
    return <div className="flex justify-center py-8"><Spinner className="h-6 w-6" /></div>;
  }

  if (codes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No referral codes found. Create one from an auction detail page.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {codes.map((s) => {
        const isCreditBusy  = crediting === s.codeId;
        const isClaimBusy   = claiming  === s.codeId;
        const hasUncredited = s.uncredited.length > 0;

        return (
          <div key={s.codeId} className="rounded-md border border-border p-4 space-y-3">
            <div className="flex justify-between items-start gap-2">
              <div className="space-y-0.5 min-w-0">
                <p className="font-mono text-xs text-muted-foreground truncate">{s.codeId}</p>
                <p className="text-xs text-muted-foreground">
                  Auction: {s.auctionId.slice(0, 16)}… · {(s.commissionBps / 100).toFixed(2)}% commission
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold">{formatMicrocredits(s.earned)}</p>
                <p className="text-xs text-muted-foreground">earned</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {s.loadingKeys ? (
                <Spinner className="h-3 w-3" />
              ) : hasUncredited ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!crediting || !!claiming}
                  onClick={() => handleCreditAll(s)}
                >
                  {isCreditBusy
                    ? <><Spinner className="mr-2 h-3 w-3" />Crediting…</>
                    : `Credit ${s.uncredited.length} Bidder${s.uncredited.length !== 1 ? 's' : ''}`}
                </Button>
              ) : (
                <Badge variant="outline" className="text-xs text-emerald-600 dark:text-emerald-400">
                  All bidders credited
                </Badge>
              )}

              {s.earned > 0n && (
                <Button
                  size="sm"
                  disabled={!!crediting || !!claiming || hasUncredited}
                  title={hasUncredited ? 'Credit all bidders first' : undefined}
                  onClick={() => handleClaim(s)}
                >
                  {isClaimBusy
                    ? <><Spinner className="mr-2 h-3 w-3" />Claiming…</>
                    : `Claim ${formatMicrocredits(s.earned)}`}
                </Button>
              )}
            </div>

            {errors[s.codeId] && (
              <p className="text-xs text-destructive">{errors[s.codeId]}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
