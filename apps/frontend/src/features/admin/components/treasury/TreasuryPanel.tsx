import { useState, useMemo }             from 'react';
import { useQueryClient }                from '@tanstack/react-query';
import { Button, Input, Label, Spinner } from '@/components';
import { WizardTxStatus }                from '@/shared/components/WizardTxStatus';
import { formatMicrocredits, aleoToMicro } from '@fairdrop/sdk/credits';
import { computeWithdrawalOpHash, generateNonce } from '@fairdrop/sdk/hash';
import { withdrawTreasuryFees }          from '@fairdrop/sdk/transactions';
import { SignaturePanel, sigsComplete }  from '../shared/SignaturePanel';
import { MsgHashPanel }                  from '../shared/MsgHashPanel';
import { useTwoPhaseOp }                 from '../shared/useTwoPhaseOp';
import { useTreasuryBalances, AUCTION_PROGRAMS } from '../../hooks/useTreasuryBalances';
import { EMPTY_SIGS, type ThreeSigs }    from '../../types';

// ── Per-program row ───────────────────────────────────────────────────────────

interface TreasuryRowProps {
  label:     string;
  programId: string;
  balance:   bigint;
  onSuccess: () => void;
}

function TreasuryRow({ label, programId, balance, onSuccess }: TreasuryRowProps) {
  const [open,      setOpen]      = useState(false);
  const [amountIn,  setAmountIn]  = useState('');
  const [recipient, setRecipient] = useState('');
  const [sigs,      setSigs]      = useState<ThreeSigs>(EMPTY_SIGS);
  const [opNonce]   = useState<bigint>(() => generateNonce());
  const [requestId] = useState<bigint>(() => generateNonce());

  const amount = aleoToMicro(amountIn) ?? 0n;

  const opHash = useMemo(() => {
    if (!amount || !recipient.startsWith('aleo1')) return '';
    try { return computeWithdrawalOpHash(amount, recipient, opNonce); }
    catch { return ''; }
  }, [amount, recipient, opNonce]);

  // Build a minimal AuctionView-like object for withdrawTreasuryFees.
  const buildPhase2 = useMemo(
    () => () => withdrawTreasuryFees(
      { programId } as Parameters<typeof withdrawTreasuryFees>[0],
      amount,
      recipient,
      opNonce,
    ),
    [programId, amount, recipient, opNonce],
  );

  const { msgHash, currentStep, busy, isWaiting, done, error, trackedIds, advance, reset } =
    useTwoPhaseOp({ opHash, requestId, sigs, phase2Label: 'Withdraw fees', buildPhase2 });

  if (done) {
    onSuccess();
    reset();
    setAmountIn('');
    setRecipient('');
    setSigs(EMPTY_SIGS);
    setOpen(false);
  }

  const canSubmit = !!opHash && sigsComplete(sigs) && !busy && !isWaiting;

  return (
    <div className="space-y-2 border-b border-border/50 pb-3 last:border-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="font-mono text-xs text-muted-foreground">{formatMicrocredits(balance)}</p>
        </div>
        <Button
          size="sm" variant="outline" className="h-7 text-xs"
          disabled={balance === 0n}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Cancel' : 'Withdraw'}
        </Button>
      </div>

      {open && (
        <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Amount (ALEO)</Label>
              <Input className="h-7 text-xs" placeholder="0.0" value={amountIn} onChange={(e) => setAmountIn(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Recipient address</Label>
              <Input className="h-7 text-xs font-mono" placeholder="aleo1…" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
            </div>
          </div>

          {opHash && (
            <>
              <MsgHashPanel msgHash={msgHash} />
              <SignaturePanel value={sigs} onChange={setSigs} />
            </>
          )}

          {trackedIds.length > 0 && <WizardTxStatus trackedIds={trackedIds} />}
          {error && <p className="text-xs text-destructive">{error.message}</p>}

          <Button size="sm" className="w-full" disabled={!canSubmit} onClick={() => void advance()}>
            {busy || isWaiting
              ? <><Spinner className="mr-1.5 h-3 w-3" />{currentStep === 0 ? 'Submitting approval…' : 'Withdrawing…'}</>
              : currentStep === 0 ? 'Submit Approval' : 'Withdraw fees'}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── TreasuryPanel ─────────────────────────────────────────────────────────────

export function TreasuryPanel() {
  const queryClient                    = useQueryClient();
  const { data: balances, isLoading }  = useTreasuryBalances();

  if (isLoading) return <div className="flex justify-center py-8"><Spinner className="h-5 w-5" /></div>;
  if (!balances) return <p className="text-sm text-muted-foreground">Could not load treasury balances.</p>;

  return (
    <div className="space-y-3">
      {AUCTION_PROGRAMS.map(({ label, programId }) => (
        <TreasuryRow
          key={programId}
          label={label}
          programId={programId}
          balance={balances[programId] ?? 0n}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['treasury', 'balances'] })}
        />
      ))}
    </div>
  );
}
