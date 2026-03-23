import { useState }               from 'react';
import { useWallet }               from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Input, Label, Spinner } from '@fairdrop/ui';
import { config }                  from '@/env';
import { parseExecutionError }     from '@/shared/utils/errors';
import { useTransactionStore }     from '@/stores/transaction.store';
import { ConnectWalletPrompt }     from '@/shared/components/wallet/ConnectWalletPrompt';
import { ReferralCommissionsTab }  from '../../earnings/components/ReferralCommissionsTab';

const REF_PROGRAM = config.programs.ref.programId;

export function ReferralPage() {
  const { connected, executeTransaction } = useWallet();
  const { setTx } = useTransactionStore();

  const [auctionId,     setAuctionId]     = useState('');
  const [creating,      setCreating]      = useState(false);
  const [createError,   setCreateError]   = useState('');
  const [createSuccess, setCreateSuccess] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!auctionId.trim()) return;

    setCreateError('');
    setCreateSuccess(false);
    setCreating(true);
    try {
      const id = auctionId.trim().endsWith('field')
        ? auctionId.trim()
        : `${auctionId.trim()}field`;

      const result = await executeTransaction({
        program:  REF_PROGRAM,
        function: 'create_code',
        inputs:   [id],
        fee:      0.05,
      });
      if (result?.transactionId) setTx(result.transactionId, 'Create referral code');
      setCreateSuccess(true);
      setAuctionId('');
    } catch (err) {
      setCreateError(parseExecutionError(err));
    } finally {
      setCreating(false);
    }
  }

  if (!connected) {
    return (
      <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
        <h1 className="text-2xl font-semibold">Referral</h1>
        <ConnectWalletPrompt message="Connect your wallet to manage referral codes." />
      </div>
    );
  }

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
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ref-auction-id">Auction ID</Label>
            <Input
              id="ref-auction-id"
              placeholder="Paste the auction field ID (e.g. 1234…field)"
              value={auctionId}
              onChange={(e) => setAuctionId(e.target.value)}
            />
          </div>

          {createError && <p className="text-xs text-destructive">{createError}</p>}
          {createSuccess && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Code submitted — it will appear below once confirmed on-chain.
            </p>
          )}

          <Button type="submit" size="sm" disabled={creating || !auctionId.trim()}>
            {creating
              ? <><Spinner className="mr-2 h-3 w-3" />Creating…</>
              : 'Create Code'}
          </Button>
        </form>
      </section>

      {/* ── Existing codes (Phase 4 component) ──────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Your Codes</h2>
        <ReferralCommissionsTab />
      </section>
    </div>
  );
}
