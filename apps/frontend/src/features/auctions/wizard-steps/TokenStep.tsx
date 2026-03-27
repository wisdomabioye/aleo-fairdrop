import { useState, useEffect, useMemo } from 'react';
import { Link }                          from 'react-router-dom';
import { useWallet }                     from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Spinner }               from '@/components';
import { fetchTokenRole }                from '@fairdrop/sdk/registry';
import { formatAmount }                  from '@fairdrop/sdk/format';
import { SYSTEM_PROGRAMS }              from '@fairdrop/sdk/constants';
import { config, TX_DEFAULT_FEE }        from '@/env';
import { AppRoutes }                     from '@/config/app.routes';
import { useTokenRecords }               from '@/shared/hooks/useTokenRecords';
import { useTokenMetadata }              from '@/shared/hooks/useTokenMetadata';
import { useConfirmedSequentialTx }      from '@/shared/hooks/useConfirmedSequentialTx';
import { ConnectWalletPrompt }           from '@/shared/components/wallet/ConnectWalletPrompt';
import type { WalletTokenRecord }        from '@fairdrop/types/primitives';
import type { TokenMetadata }            from '@fairdrop/types/domain';
import type { StepProps }                from './types';

export function TokenStep({ form, onChange }: StepProps) {
  const { connected, executeTransaction } = useWallet();

  // ── Records ─────────────────────────────────────────────────────────────────

  const { tokenRecords, loading: loadingRecs } = useTokenRecords({ fetchOnMount: true });

  const visibleRecords = useMemo(
    () => tokenRecords.filter((r) => !r.spent && r.amount > 0n),
    [tokenRecords],
  );

  const uniqueTokenIds = useMemo(
    () => Array.from(new Set(visibleRecords.map((r) => r.token_id))),
    [visibleRecords],
  );

  // Preload metadata for every visible token — react-query caches + deduplicates
  const { dataMap: metaMap, isLoading: metaLoading } = useTokenMetadata(uniqueTokenIds);

  // Token groups: one entry per unique token ID
  const tokenGroups = useMemo(() =>
    uniqueTokenIds.map((id) => {
      const records     = visibleRecords.filter((r) => r.token_id === id);
      const totalAmount = records.reduce((s, r) => s + r.amount, 0n);
      return { tokenId: id, meta: metaMap.get(id) ?? null, records, totalAmount };
    }),
    [uniqueTokenIds, visibleRecords, metaMap],
  );

  // Which token group is expanded (Level 1 → Level 2)
  const [browsingId, setBrowsingId] = useState<string | null>(null);

  // ── Role check ───────────────────────────────────────────────────────────────

  const [roleStatus, setRoleStatus] = useState<'idle' | 'checking' | 'ok' | 'missing'>('idle');

  const auctionProgram        = form.auctionType ? config.programs[form.auctionType] : null;
  const auctionProgramAddress = auctionProgram?.programAddress ?? '';
  const programDeployed       = auctionProgramAddress.startsWith('aleo1');

  useEffect(() => {
    if (!form.saleTokenId || !programDeployed) return;
    setRoleStatus('checking');
    fetchTokenRole(auctionProgramAddress, form.saleTokenId)
      .then((role) => {
        setRoleStatus(role != null && role >= 1 ? 'ok' : 'missing')
      })
      .catch(() => setRoleStatus('missing'));
  }, [form.saleTokenId, auctionProgramAddress, programDeployed]);

  // ── Record selection (synchronous — metadata already loaded) ─────────────────

  function selectRecord(rec: WalletTokenRecord, meta: TokenMetadata | null) {
    const decimals = meta?.decimals ?? 6;
    onChange({
      tokenRecord:   rec._record,
      saleTokenId:   rec.token_id,
      supply:        rec.amount.toString(),
      tokenSymbol:   meta?.symbol  ?? '',
      tokenDecimals: decimals,
      saleScale:     String(10 ** decimals),
    });
  }

  // ── Authorization ─────────────────────────────────────────────────────────────

  const authSteps = [{
    label: 'Authorize Auction Program',
    execute: async () => {
      const result = await executeTransaction({
        program:    SYSTEM_PROGRAMS.tokenRegistry,
        function:   'set_role',
        inputs:     [form.saleTokenId, auctionProgramAddress, '3u8'],
        fee:        TX_DEFAULT_FEE,
        privateFee: false,
      });
      return result?.transactionId;
    },
  }];

  const { done: authDone, busy: authBusy, isWaiting: authWaiting,
          error: authError, advance: authorize } =
    useConfirmedSequentialTx(authSteps);

  useEffect(() => { if (authDone) setRoleStatus('ok'); }, [authDone]);

  const authBlocked = authBusy || authWaiting;

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!connected) {
    return (
      <ConnectWalletPrompt
        message="Connect your wallet to select a token record"
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground py-4">
        Select the token record to auction. Supply equals the record amount —{' '}
        <Link to={AppRoutes.tokenManager} className="text-primary underline">
          split your balance in Token Manager
        </Link>{' '}
        first if you need a specific quantity.
      </p>

      {/* ── Level 1: token type list ─────────────────────────────────────────── */}
      {loadingRecs ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="h-4 w-4" /> Loading token records…
        </div>
      ) : tokenGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No token records found. Mint a token in{' '}
          <Link to={AppRoutes.tokenLaunch} className="text-primary underline">Token Launch</Link>.
        </p>
      ) : (
        <div className="space-y-2">
          {tokenGroups.map(({ tokenId, meta, records, totalAmount }) => {
            const isOpen      = browsingId === tokenId;
            const hasSelected = form.saleTokenId === tokenId && !!form.tokenRecord;

            return (
              <div key={tokenId} className="rounded-lg border border-border overflow-hidden">

                {/* Token type header — click to expand record list */}
                <button
                  type="button"
                  onClick={() => setBrowsingId(isOpen ? null : tokenId)}
                  className={[
                    'w-full flex items-center justify-between gap-3 p-3 text-left text-sm transition-colors',
                    isOpen || hasSelected ? 'bg-primary/5' : 'hover:bg-muted/40',
                  ].join(' ')}
                >
                  {/* Symbol + name */}
                  <div className="flex items-center gap-2 min-w-0">
                    {metaLoading && !meta ? (
                      <Spinner className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <span className="font-semibold shrink-0">
                        {meta?.symbol ?? '—'}
                      </span>
                    )}
                    {meta?.name && (
                      <span className="text-xs text-muted-foreground truncate">{meta.name}</span>
                    )}
                  </div>

                  {/* Right side: total + record count + chevron */}
                  <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                    {hasSelected && (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓</span>
                    )}
                    <span>
                      {formatAmount(totalAmount, meta?.decimals ?? 0)}{meta?.symbol ? ` ${meta.symbol}` : ''}
                      {' · '}{records.length} record{records.length !== 1 ? 's' : ''}
                    </span>
                    <span>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* ── Level 2: individual records ──────────────────────────── */}
                {isOpen && (
                  <div className="border-t border-border divide-y divide-border">
                    {records.map((rec) => {
                      const isSelected = form.tokenRecord === rec._record;
                      return (
                        <button
                          key={rec.id}
                          type="button"
                          onClick={() => selectRecord(rec, meta)}
                          className={[
                            'w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors',
                            isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/40',
                          ].join(' ')}
                        >
                          <span className="font-mono text-xs text-muted-foreground">
                            {rec.token_id.slice(0, 18)}…
                          </span>
                          <span className="font-medium">
                            {formatAmount(rec.amount, meta?.decimals ?? 0)}{meta?.symbol ? ` ${meta.symbol}` : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Selected record summary + role check ────────────────────────────── */}
      {form.saleTokenId && form.tokenRecord && (
        <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Token</span>
            <span className="font-medium">
              {form.tokenSymbol
                ? `${form.tokenSymbol} · ${form.tokenDecimals} decimals`
                : <span className="font-mono">{form.saleTokenId.slice(0, 16)}…</span>}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Supply</span>
            <span className="font-medium">
              {formatAmount(BigInt(form.supply), form.tokenDecimals)}{form.tokenSymbol ? ` ${form.tokenSymbol}` : ''}
            </span>
          </div>

          {!programDeployed && (
            <p className="text-yellow-600 dark:text-yellow-400">
              Auction program not yet deployed — role check skipped.
            </p>
          )}
          {programDeployed && roleStatus === 'checking' && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Spinner className="h-3 w-3" /> Checking authorization…
            </div>
          )}
          {programDeployed && roleStatus === 'missing' && (
            <div className="space-y-2">
              <p className="text-yellow-600 dark:text-yellow-400 py-2">
                The auction program needs mint permission for this token.
              </p>
              <Button type="button" size="sm" disabled={authBlocked} onClick={authorize}>
                {authBusy     ? <><Spinner className="mr-2 h-3 w-3" />Authorizing…</>
                : authWaiting ? <><Spinner className="mr-2 h-3 w-3" />Confirming…</>
                : 'Authorize Auction Program'}
              </Button>
              {authError && <p className="text-destructive pt-1">{authError.message}</p>}
            </div>
          )}
          {programDeployed && roleStatus === 'ok' && (
            <p className="text-emerald-600 dark:text-emerald-400">
              ✓ Auction program is authorized to mint this token
            </p>
          )}
        </div>
      )}
    </div>
  );
}
