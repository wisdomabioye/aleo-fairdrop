import { useState, useEffect }      from 'react';
import { Link }                      from 'react-router-dom';
import { useWallet }                 from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Spinner }           from '@/components';
import { fetchTokenInfo, fetchTokenRole } from '@fairdrop/sdk/registry';
import { SYSTEM_PROGRAMS }           from '@fairdrop/sdk/constants';
import { config, TX_DEFAULT_FEE }    from '@/env';
import { AppRoutes }                 from '@/config/app.routes';
import { useTokenRecords }           from '@/shared/hooks/useTokenRecords';
import { useConfirmedSequentialTx }  from '@/shared/hooks/useConfirmedSequentialTx';
import { WizardTxStatus }            from '@/shared/components/WizardTxStatus';
import type { WalletTokenRecord }    from '@fairdrop/types/primitives';
import type { StepProps }            from './types';

export function TokenStep({ form, onChange }: StepProps) {
  const { connected, executeTransaction } = useWallet();

  const { tokenRecords, loading: loadingRecs } = useTokenRecords({ fetchOnMount: true });
  console.log("tokenRecords", tokenRecords)
  // Only show unspent records that actually hold a balance
  const visibleRecords = tokenRecords.filter((r) => !r.spent && r.amount > 0n);

  const [roleStatus, setRoleStatus] = useState<'idle' | 'checking' | 'ok' | 'missing'>('idle');

  const auctionProgram        = form.auctionType ? config.programs[form.auctionType] : null;
  const auctionProgramAddress = auctionProgram?.programAddress ?? '';
  const programDeployed       = auctionProgramAddress.startsWith('aleo1');

  // Check role whenever selected token or auction type changes
  useEffect(() => {
    if (!form.saleTokenId || !programDeployed) return;
    setRoleStatus('checking');
    fetchTokenRole(auctionProgramAddress, form.saleTokenId)
      .then((role) => setRoleStatus(role != null && role >= 1 ? 'ok' : 'missing'))
      .catch(() => setRoleStatus('missing'));
  }, [form.saleTokenId, auctionProgramAddress, programDeployed]);

  async function selectRecord(rec: WalletTokenRecord) {
    const info     = await fetchTokenInfo(rec.token_id).catch(() => null);
    const decimals = info?.decimals ?? 6;
    onChange({
      tokenRecord:   rec._record,
      saleTokenId:   rec.token_id,
      supply:        rec.amount.toString(),
      tokenSymbol:   info?.symbol  ?? '',
      tokenDecimals: decimals,
      saleScale:     String(10 ** decimals),
    });
  }

  // Auth step — grant auction program mint role on the selected token
  const authSteps = [{
    label: 'Authorize Auction Program',
    execute: async () => {
      const result = await executeTransaction({
        program:    SYSTEM_PROGRAMS.tokenRegistry,
        function:   'set_role',
        inputs:     [form.saleTokenId, auctionProgramAddress, '3u8'],
        fee:        TX_DEFAULT_FEE,
        privateFee: true,
      });
      return result?.transactionId;
    },
  }];

  const { done: authDone, busy: authBusy, isWaiting: authWaiting,
          error: authError, trackedIds: authIds, advance: authorize } =
    useConfirmedSequentialTx(authSteps);

  // Mark authorized once the tx confirms on-chain
  useEffect(() => {
    if (authDone) setRoleStatus('ok');
  }, [authDone]);

  const authBlocked = authBusy || authWaiting;

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
      ) : visibleRecords.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No token records found. Mint a token in{' '}
          <Link to={AppRoutes.tokenLaunch} className="text-primary underline">
            Token Launch
          </Link>.
        </p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {visibleRecords.map((rec) => (
            <button
              key={rec.id}
              type="button"
              onClick={() => selectRecord(rec)}
              className={[
                'w-full rounded-lg border p-3 text-left text-sm transition-colors',
                form.saleTokenId === rec.token_id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground/40',
              ].join(' ')}
            >
              <div className="font-mono text-xs text-muted-foreground truncate">{rec.token_id}</div>
              <div className="mt-0.5 font-medium">Amount: {rec.amount.toString()}</div>
            </button>
          ))}
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
                size="sm"
                disabled={authBlocked}
                onClick={authorize}
              >
                {authBusy      ? <><Spinner className="mr-2 h-3 w-3" />Authorizing…</>
                : authWaiting  ? <><Spinner className="mr-2 h-3 w-3" />Confirming…</>
                : 'Authorize Auction Program'}
              </Button>
              {authError && <p className="text-destructive">{authError.message}</p>}
              {authIds.length > 0 && <WizardTxStatus trackedIds={authIds} />}
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
