import { useState }               from 'react';
import { useWallet }               from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Input, Label, Spinner } from '@/components';
import { config, TX_DEFAULT_FEE }                  from '@/env';
import { parseExecutionError }     from '@/shared/utils/errors';
import { useConfirmedSequentialTx } from '@/shared/hooks/useConfirmedSequentialTx';
import { ConnectWalletPrompt }     from '@/shared/components/wallet/ConnectWalletPrompt';
import { ReferralCommissionsTab }  from '../../earnings/components/ReferralCommissionsTab';

const REF_PROGRAM = config.programs.ref.programId;

export function ReferralPage() {
  const { connected, executeTransaction } = useWallet();
  const [auctionId, setAuctionId] = useState('');

  const tx = useConfirmedSequentialTx([{
    label: 'Create referral code',
    execute: async () => {
      const id = auctionId.trim().endsWith('field')
        ? auctionId.trim()
        : `${auctionId.trim()}field`;
      const result = await executeTransaction({
        program:  REF_PROGRAM,
        function: 'create_code',
        inputs:   [id],
        fee:      TX_DEFAULT_FEE,
      });
      return result?.transactionId;
    },
  }]);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!auctionId.trim()) return;
    tx.advance();
  }

  function handleCreateAnother() {
    tx.reset();
    setAuctionId('');
  }

  if (!connected) {
    return (
      <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
        <h1 className="text-2xl font-semibold">Referral</h1>
        <ConnectWalletPrompt message="Connect your wallet to manage referral codes." />
      </div>
    );
  }

  const busy     = tx.busy || tx.isWaiting;
  const errorMsg = tx.error ? parseExecutionError(tx.error) : '';

  return (
    <div className="max-w-3xl mx-auto space-y-8 py-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">Referral</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create referral codes and earn commissions on bids placed through your links.
        </p>
      </div>

      {/* ── Create code ─────────────────────────────────────────────────────── */}
      <section className="rounded-md border border-border p-4 space-y-4">
        <h2 className="text-sm font-semibold">Create a Referral Code</h2>
        <p className="text-xs text-muted-foreground">
          Your commission rate is set by the auction configuration and applied automatically.
        </p>

        {tx.done ? (
          <div className="space-y-3">
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Code confirmed on-chain — it will appear below shortly.
            </p>
            <Button size="sm" variant="outline" onClick={handleCreateAnother}>
              Create another
            </Button>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ref-auction-id">Auction ID</Label>
              <Input
                id="ref-auction-id"
                placeholder="Paste the auction field ID (e.g. 1234…field)"
                value={auctionId}
                onChange={(e) => setAuctionId(e.target.value)}
                disabled={busy}
              />
            </div>

            {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}

            <Button type="submit" size="sm" disabled={busy || !auctionId.trim()}>
              {busy
                ? <><Spinner className="mr-2 h-3 w-3" />{tx.isWaiting ? 'Confirming…' : 'Creating…'}</>
                : 'Create Code'}
            </Button>
          </form>
        )}
      </section>

      {/* ── Existing codes ───────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Your Codes</h2>
        <ReferralCommissionsTab />
      </section>
    </div>
  );
}
