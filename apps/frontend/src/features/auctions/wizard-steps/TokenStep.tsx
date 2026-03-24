import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Spinner } from '@/components';
import { fetchTokenInfo, fetchTokenRole } from '@fairdrop/sdk/registry';
import { SYSTEM_PROGRAMS } from '@fairdrop/sdk/constants';
import { config } from '@/env';
import { AppRoutes } from '@/config/routes';
import { parseExecutionError } from '@/shared/utils/errors';
import type { StepProps } from './types';
import { stripSuffix } from '@fairdrop/sdk/parse';

/** Ensure field value ends with "field" */
function asField(raw: string): string {
  const stripped = stripSuffix(raw);
  return stripped.endsWith('field') ? stripped : `${stripped}field`;
}

export function TokenStep({ form, onChange }: StepProps) {
  const { connected, address, requestRecords, executeTransaction } = useWallet();

  const [records,      setRecords]      = useState<Record<string, unknown>[]>([]);
  const [loadingRecs,  setLoadingRecs]  = useState(false);
  const [roleStatus,   setRoleStatus]   = useState<'idle' | 'checking' | 'ok' | 'missing'>('idle');
  const [authLoading,  setAuthLoading]  = useState(false);
  const [txError,      setTxError]      = useState<string | null>(null);

  const auctionProgramAddress =
    form.auctionType ? config.programs[form.auctionType].programAddress : '';
  const programDeployed = auctionProgramAddress.startsWith('aleo1');

  // Load token records when wallet connects
  useEffect(() => {
    if (!connected) return;
    setLoadingRecs(true);
    (requestRecords as (p: string) => Promise<Record<string, unknown>[]>)(
      SYSTEM_PROGRAMS.tokenRegistry,
    )
      .then((recs) => setRecords(recs ?? []))
      .catch(() => setRecords([]))
      .finally(() => setLoadingRecs(false));
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check role whenever selected token or auction type changes
  useEffect(() => {
    if (!form.saleTokenId || !programDeployed) return;
    setRoleStatus('checking');
    fetchTokenRole(auctionProgramAddress, form.saleTokenId)
      .then((role) => setRoleStatus(role != null && role >= 1 ? 'ok' : 'missing'))
      .catch(() => setRoleStatus('missing'));
  }, [form.saleTokenId, auctionProgramAddress, programDeployed]);

  async function selectRecord(rec: Record<string, unknown>) {
    const data       = (rec.data ?? rec) as Record<string, string>;
    const tokenId    = asField(String(data.token_id ?? ''));
    const amount     = stripSuffix(String(data.amount ?? '0'));
    const info       = await fetchTokenInfo(tokenId).catch(() => null);
    const decimals   = info?.decimals ?? 6;
    onChange({
      tokenRecord:   rec,
      saleTokenId:   tokenId,
      supply:        amount,
      tokenSymbol:   info?.symbol  ?? '',
      tokenDecimals: decimals,
      saleScale:     String(10 ** decimals),
    });
  }

  async function handleAuthorize() {
    if (!form.saleTokenId || !address) return;
    setTxError(null);
    setAuthLoading(true);
    try {
      await executeTransaction({
        program:  SYSTEM_PROGRAMS.tokenRegistry,
        function: 'set_role',
        inputs:   [form.saleTokenId, auctionProgramAddress, '3u8'],
        fee:      0.1,
      });
      setRoleStatus('ok');
    } catch (err) {
      setTxError(parseExecutionError(err instanceof Error ? err.message : String(err)));
    } finally {
      setAuthLoading(false);
    }
  }

  if (!connected) {
    return (
      <p className="text-sm text-muted-foreground">
        Connect your wallet to select a token record.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Select the private token record to auction. The auction supply equals the full
        record amount —{' '}
        <Link to={AppRoutes.tokenManager} className="text-primary underline">
          split your balance in Token Manager
        </Link>{' '}
        first if you need a specific quantity.
      </p>

      {/* Record list */}
      {loadingRecs ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="h-4 w-4" />
          Loading token records…
        </div>
      ) : records.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No token records found. Mint a token in{' '}
          <Link to={AppRoutes.tokenLaunch} className="text-primary underline">
            Token Launch
          </Link>.
        </p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {records.map((rec, i) => {
            const data     = (rec.data ?? rec) as Record<string, string>;
            const tokenId  = asField(String(data.token_id ?? ''));
            const amount   = stripSuffix(String(data.amount ?? '0'));
            const selected = form.saleTokenId === tokenId;
            return (
              <button
                key={i}
                type="button"
                onClick={() => selectRecord(rec)}
                className={[
                  'w-full rounded-lg border p-3 text-left text-sm transition-colors',
                  selected
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/40',
                ].join(' ')}
              >
                <div className="font-mono text-xs text-muted-foreground truncate">{tokenId}</div>
                <div className="mt-0.5 font-medium">Amount: {amount}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected token summary + auth check */}
      {form.saleTokenId && (
        <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2 text-xs">
          <div className="text-muted-foreground">
            Token ID: <span className="font-mono break-all">{form.saleTokenId}</span>
          </div>
          {form.tokenSymbol && (
            <div className="text-muted-foreground">
              {form.tokenSymbol} · {form.tokenDecimals} decimals
            </div>
          )}
          <div className="text-muted-foreground">Supply: {form.supply}</div>

          {/* Role check */}
          {!programDeployed && (
            <p className="text-yellow-600 dark:text-yellow-400">
              Auction program address not yet deployed — role check skipped.
            </p>
          )}
          {programDeployed && roleStatus === 'checking' && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Spinner className="h-3 w-3" /> Checking authorization…
            </div>
          )}
          {programDeployed && roleStatus === 'missing' && (
            <div className="space-y-2">
              <p className="text-yellow-600 dark:text-yellow-400">
                The auction program needs mint permission for this token.
              </p>
              <Button
                type="button"
                disabled={authLoading}
                onClick={handleAuthorize}
              >
                {authLoading ? (
                  <><Spinner className="mr-2 h-3 w-3" />Authorizing…</>
                ) : (
                  'Authorize Auction Program'
                )}
              </Button>
              {txError && <p className="text-destructive">{txError}</p>}
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
