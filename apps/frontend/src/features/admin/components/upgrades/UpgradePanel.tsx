import { useState }                     from 'react';
import { useQueryClient }                from '@tanstack/react-query';
import { useWallet }                     from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Input, Label, Spinner } from '@/components';
import { WizardTxStatus }                from '@/shared/components/WizardTxStatus';
import { generateNonce }                 from '@fairdrop/sdk/hash';
import { prepareApproveUpgrade, submitApproveUpgrade } from '@fairdrop/sdk/multisig';
import { useConfirmedSequentialTx }      from '@/shared/hooks/useConfirmedSequentialTx';
import { SignaturePanel, sigsComplete }  from '../shared/SignaturePanel';
import { MsgHashPanel }                  from '../shared/MsgHashPanel';
import { useUpgradeStatus }              from '../../hooks/useUpgradeStatus';
import { EMPTY_SIGS, type ThreeSigs }    from '../../types';
import type { ContractUpgradeEntry }     from '../../hooks/useUpgradeStatus';

// ── Checksum parsing helpers ──────────────────────────────────────────────────

/** Format a number[] checksum as a hex string for display. */
function checksumToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Parse a user-supplied checksum string (hex or comma-separated bytes)
 * into number[32] or null if invalid.
 */
function parseChecksumInput(raw: string): number[] | null {
  const trimmed = raw.trim();

  // Try hex: 64 chars
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    const bytes: number[] = [];
    for (let i = 0; i < 64; i += 2) bytes.push(parseInt(trimmed.slice(i, i + 2), 16));
    return bytes;
  }

  // Try comma-separated decimal bytes
  const parts = trimmed.split(',').map((s) => s.trim());
  if (parts.length === 32) {
    const bytes = parts.map(Number);
    if (bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) return bytes;
  }

  return null;
}

// ── Per-contract row ──────────────────────────────────────────────────────────

interface UpgradeRowProps {
  entry:     ContractUpgradeEntry;
  onSuccess: () => void;
}

function UpgradeRow({ entry, onSuccess }: UpgradeRowProps) {
  const { executeTransaction }   = useWallet();
  const [open, setOpen]          = useState(false);
  const [checksumIn, setChecksumIn] = useState('');
  const [sigs, setSigs]          = useState<ThreeSigs>(EMPTY_SIGS);
  const [requestId]              = useState<bigint>(() => generateNonce());

  const checksum = parseChecksumInput(checksumIn);
  const { msgHash } = checksum
    ? prepareApproveUpgrade(entry.key, checksum, requestId)
    : { msgHash: '' };

  const steps = [
    {
      label: `Approve upgrade: ${entry.name}`,
      execute: async () => {
        if (!checksum) throw new Error('Invalid checksum');
        const spec = submitApproveUpgrade(
          entry.key,
          checksum,
          sigs[0].sig, sigs[0].admin,
          sigs[1].sig, sigs[1].admin,
          sigs[2].sig, sigs[2].admin,
          requestId,
        );
        const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
        return result?.transactionId;
      },
    },
  ];

  const { busy, isWaiting, done, error, trackedIds, advance, reset } =
    useConfirmedSequentialTx(steps);

  if (done) {
    onSuccess();
    reset();
    setChecksumIn('');
    setSigs(EMPTY_SIGS);
    setOpen(false);
  }

  const canSubmit = !!checksum && sigsComplete(sigs) && !busy && !isWaiting;

  return (
    <div className="space-y-2 border-b border-border/50 pb-3 last:border-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{entry.name}</p>
          <p className="font-mono text-[11px] text-muted-foreground">
            key: {entry.key} ·{' '}
            {entry.checksum
              ? <span className="text-emerald-600 dark:text-emerald-400">approved: {checksumToHex(entry.checksum).slice(0, 16)}…</span>
              : <span className="text-muted-foreground">no approval</span>}
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => setOpen((o) => !o)}>
          {open ? 'Cancel' : 'Approve upgrade'}
        </Button>
      </div>

      {open && (
        <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Checksum (64-char hex from <code>leo build</code>)</Label>
            <Input
              className="h-7 text-xs font-mono"
              placeholder="0a1b2c…"
              value={checksumIn}
              onChange={(e) => setChecksumIn(e.target.value)}
            />
          </div>

          {msgHash && (
            <>
              <MsgHashPanel msgHash={msgHash} />
              <SignaturePanel value={sigs} onChange={setSigs} />
            </>
          )}

          {trackedIds.length > 0 && <WizardTxStatus trackedIds={trackedIds} />}
          {error && <p className="text-xs text-destructive">{error.message}</p>}

          <Button size="sm" className="w-full" disabled={!canSubmit} onClick={() => void advance()}>
            {busy || isWaiting
              ? <><Spinner className="mr-1.5 h-3 w-3" />Approving…</>
              : 'Submit upgrade approval'}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── UpgradePanel ──────────────────────────────────────────────────────────────

export function UpgradePanel() {
  const queryClient                    = useQueryClient();
  const { data: entries, isLoading }   = useUpgradeStatus();

  if (isLoading) return <div className="flex justify-center py-8"><Spinner className="h-5 w-5" /></div>;
  if (!entries)  return <p className="text-sm text-muted-foreground">Could not load upgrade status.</p>;

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <UpgradeRow
          key={entry.key}
          entry={entry}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['upgradeStatus'] })}
        />
      ))}
    </div>
  );
}
