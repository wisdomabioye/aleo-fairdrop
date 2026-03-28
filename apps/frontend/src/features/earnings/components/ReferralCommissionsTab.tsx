import { useState, useEffect, useCallback } from 'react';
import { Link }                 from 'react-router-dom';
import { useWallet }            from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Spinner, Badge, Card, CardContent, CardHeader, CopyField } from '@/components';
import { formatMicrocredits }   from '@fairdrop/sdk/credits';
import { parsePlaintext, stripVisibility, stripSuffix } from '@fairdrop/sdk/parse';
import type { WalletRecord }    from '@fairdrop/types/primitives';
import { fetchMapping, fetchMappingBigInt } from '@/lib/mapping';
import { computeRefListKey }    from '@fairdrop/sdk/hash';
import { config }               from '@/env';
import { auctionDetailUrl }     from '@/config';
import { creditCommission, claimCommission } from '@/lib/auctionTx';
import { ConnectWalletPrompt }  from '@/shared/components/wallet/ConnectWalletPrompt';
import { parseExecutionError }  from '@/shared/utils/errors';
import { useTransactionTracker } from '@/providers/transaction-tracker';

// ── constants ──────────────────────────────────────────────────────────────────

const REF_PROGRAM = config.programs.ref.programId;

// ── on-chain helpers ───────────────────────────────────────────────────────────

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
  const [crediting, setCrediting] = useState<string | null>(null);
  const [claiming,  setClaiming]  = useState<string | null>(null);
  const [errors,    setErrors]    = useState<Record<string, string>>({});

  const loadCodes = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    try {
      const recs = await (requestRecords as (p: string, includePlaintext: boolean) => Promise<unknown[]>)(
        REF_PROGRAM, true,
      ).catch(() => [] as unknown[]);

      const parsed: RefCodeStatus[] = [];
      for (const r of recs ?? []) {
        const entry = r as WalletRecord;
        if (typeof entry.recordPlaintext !== 'string') continue;
        if (entry.recordName !== 'ReferralCode') continue;
        try {
          const fields        = parsePlaintext(entry.recordPlaintext);
          const codeId        = stripVisibility(fields['code_id']        ?? '');
          const auctionId     = stripVisibility(fields['auction_id']     ?? '');
          const commissionBps = parseInt(stripSuffix(stripVisibility(fields['commission_bps'] ?? '0')), 10) || 0;
          if (!codeId) continue;
          parsed.push({
            raw:           entry as unknown as Record<string, unknown>,
            codeId,
            auctionId,
            commissionBps,
            earned:        0n,
            uncredited:    [],
            loadingKeys:   true,
          });
        } catch { /* skip malformed */ }
      }

      setCodes(parsed);
      setLoading(false);

      // Enrich each code with on-chain data in parallel
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
    const freshEarned = await fetchEarned(codeId);
    setCodes((prev) => prev.map((s) => s.codeId === codeId ? { ...s, earned: freshEarned } : s));
    setCrediting(null);
  }

  async function handleClaim(status: RefCodeStatus) {
    const { codeId, raw } = status;
    setErrors((e) => ({ ...e, [codeId]: '' }));
    setClaiming(codeId);
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
        try {
          const retry   = await fetchEarned(codeId);
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
    return <ConnectWalletPrompt message="Connect your wallet to see your referral codes." />;
  }

  if (loading) {
    return <div className="flex justify-center py-8"><Spinner className="h-6 w-6" /></div>;
  }

  if (codes.length === 0) {
    return (
      <div className="rounded-lg border border-border/50 bg-muted/20 py-10 text-center">
        <p className="text-sm text-muted-foreground">No referral codes found in your wallet.</p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Create a code from any active auction's detail page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {codes.map((s) => {
        const isCreditBusy  = crediting === s.codeId;
        const isClaimBusy   = claiming  === s.codeId;
        const hasUncredited = s.uncredited.length > 0;
        const shareUrl      = `${window.location.origin}${auctionDetailUrl(s.auctionId)}?ref=${s.codeId}`;
        const commissionPct = `${(s.commissionBps / 100).toFixed(2)}%`;

        return (
          <Card key={s.codeId} className="border-sky-500/10 bg-gradient-surface shadow-xs ring-1 ring-white/5">
            <CardHeader className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                      {commissionPct} commission
                    </span>
                    {s.earned > 0n && (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                        {formatMicrocredits(s.earned)} earned
                      </span>
                    )}
                  </div>
                  <Link
                    to={auctionDetailUrl(s.auctionId)}
                    className="block font-mono text-xs text-muted-foreground hover:text-foreground transition-colors truncate"
                  >
                    {s.auctionId}
                  </Link>
                </div>

                {s.loadingKeys ? (
                  <Spinner className="mt-1 size-3.5 shrink-0" />
                ) : !hasUncredited ? (
                  <Badge variant="outline" className="shrink-0 text-[10px] text-emerald-600 dark:text-emerald-400">
                    All credited
                  </Badge>
                ) : (
                  <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                    {s.uncredited.length} uncredited
                  </span>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-3 px-4 pb-4 pt-0">
              <div className="h-px bg-border/40" />

              {/* Share link */}
              <CopyField label="Referral link" value={shareUrl} truncate={false} />

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2">
                {!s.loadingKeys && hasUncredited && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!crediting || !!claiming}
                    onClick={() => handleCreditAll(s)}
                  >
                    {isCreditBusy
                      ? <><Spinner className="mr-2 h-3 w-3" />Crediting…</>
                      : `Credit ${s.uncredited.length} bidder${s.uncredited.length !== 1 ? 's' : ''}`}
                  </Button>
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
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
