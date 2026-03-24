import { useState }               from 'react';
import { Link, useParams }         from 'react-router-dom';
import { useWallet }               from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Input, Label, Spinner, Skeleton, Textarea } from '@/components';
import { isValidField }            from '@fairdrop/sdk/parse';
import { GateMode, AuctionStatus } from '@fairdrop/types/domain';
import { AppRoutes }                  from '@/config';
import { config }                  from '@/env';
import { parseExecutionError }     from '@/shared/utils/errors';
import { useTransactionStore }     from '@/stores/transaction.store';
import { ConnectWalletPrompt }     from '@/shared/components/wallet/ConnectWalletPrompt';
import { useAuction }              from '../../auctions/hooks/useAuction';

const GATE_PROGRAM = config.programs.gate.programId;

// ── Merkle gate form ──────────────────────────────────────────────────────────

function MerkleGateForm({ auctionId }: { auctionId: string }) {
  const { connected, executeTransaction } = useWallet();
  const { setTx } = useTransactionStore();

  const [proofJson, setProofJson] = useState('');
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState('');
  const [done,      setDone]      = useState(false);

  if (!connected) {
    return <ConnectWalletPrompt message="Connect your wallet to submit your Merkle proof." />;
  }

  if (done) {
    return (
      <p className="text-sm text-emerald-600 dark:text-emerald-400">
        Proof submitted. Your gate token will appear in your wallet once confirmed.
      </p>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    let parsed: { leaf: string; siblings: string[]; path_bits: string[] };
    try {
      parsed = JSON.parse(proofJson);
      if (!parsed.leaf || !Array.isArray(parsed.siblings) || !Array.isArray(parsed.path_bits)) {
        throw new Error('Missing required fields: leaf, siblings, path_bits');
      }
    } catch (err) {
      setError(`Invalid proof JSON: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    setBusy(true);
    try {
      const siblingsLeo  = `[${parsed.siblings.join(', ')}]`;
      const pathBitsLeo  = `[${parsed.path_bits.join(', ')}]`;
      const result = await executeTransaction({
        program:  GATE_PROGRAM,
        function: 'prove_merkle',
        inputs:   [auctionId, parsed.leaf, siblingsLeo, pathBitsLeo],
        fee:      0.1,
      });
      if (result?.transactionId) setTx(result.transactionId, 'Prove Merkle gate');
      setDone(true);
    } catch (err) {
      setError(parseExecutionError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="merkle-proof">Merkle Proof (JSON)</Label>
        <Textarea
          id="merkle-proof"
          rows={8}
          placeholder={`{\n  "leaf": "123field",\n  "siblings": ["456field", "789field"],\n  "path_bits": ["true", "false"]\n}`}
          value={proofJson}
          onChange={(e) => setProofJson(e.target.value)}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Provided by the auction creator or their allowlist tooling.
        </p>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button type="submit" disabled={busy || !proofJson.trim()}>
        {busy ? <><Spinner className="mr-2 h-4 w-4" />Submitting…</> : 'Submit Proof'}
      </Button>
    </form>
  );
}

// ── Credential gate form ──────────────────────────────────────────────────────

function CredentialGateForm({ auctionId }: { auctionId: string }) {
  const { connected, requestRecords, executeTransaction } = useWallet();
  const { setTx } = useTransactionStore();

  const [credKey, setCredKey] = useState('');
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState('');
  const [done,    setDone]    = useState(false);

  if (!connected) {
    return <ConnectWalletPrompt message="Connect your wallet to submit your credential." />;
  }

  if (done) {
    return (
      <p className="text-sm text-emerald-600 dark:text-emerald-400">
        Credential submitted. Your gate token will appear in your wallet once confirmed.
      </p>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!credKey.trim()) return;
    setError('');
    setBusy(true);
    try {
      // Credential records are fetched from the proof program
      const recs = await (requestRecords as (p: string) => Promise<Record<string, unknown>[]>)(
        config.programs.proof.programId,
      ).catch(() => [] as Record<string, unknown>[]);

      const cred = (recs ?? []).find((r) => {
        const data = (r.data ?? r) as Record<string, string>;
        const key  = String(data['credential_id'] ?? data['id'] ?? '');
        return key === credKey;
      });

      if (!cred) {
        setError('Credential record not found in your wallet.');
        setBusy(false);
        return;
      }

      const result = await executeTransaction({
        program:  GATE_PROGRAM,
        function: 'prove_credential',
        inputs:   [cred as unknown as string, auctionId],
        fee:      0.1,
      });
      if (result?.transactionId) setTx(result.transactionId, 'Prove credential gate');
      setDone(true);
    } catch (err) {
      setError(parseExecutionError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="cred-id">Credential ID</Label>
        <Input
          id="cred-id"
          placeholder="Credential field ID (e.g. 12345…field)"
          value={credKey}
          onChange={(e) => setCredKey(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          The credential record must be in your wallet, issued by the auction creator.
        </p>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button type="submit" disabled={busy || !credKey.trim()}>
        {busy ? <><Spinner className="mr-2 h-4 w-4" />Submitting…</> : 'Submit Credential'}
      </Button>
    </form>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export function GatePage() {
  const { id } = useParams<{ id: string }>();

  if (!id || !isValidField(id)) {
    return (
      <div className="p-6 text-center space-y-2">
        <p className="text-sm text-destructive">Invalid auction ID.</p>
        <Link to={AppRoutes.auctions} className="text-sm underline">Back to auctions</Link>
      </div>
    );
  }

  return <GateContent auctionId={id} />;
}

function GateContent({ auctionId }: { auctionId: string }) {
  const { data: auction, isLoading, isError } = useAuction(auctionId);

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto py-8 px-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError || !auction) {
    return (
      <div className="p-6 text-center space-y-2">
        <p className="text-sm text-destructive">Auction not found.</p>
        <Link to={AppRoutes.auctions} className="text-sm underline">Back to auctions</Link>
      </div>
    );
  }

  if (auction.gateMode === GateMode.Open) {
    return (
      <div className="max-w-lg mx-auto py-8 px-4 text-center space-y-3">
        <p className="text-base font-medium">No gate required</p>
        <p className="text-sm text-muted-foreground">
          This auction is open to all — no proof needed.
        </p>
        <Link to={`/auctions/${auctionId}`} className="text-sm underline">
          Back to auction
        </Link>
      </div>
    );
  }

  if (auction.status !== AuctionStatus.Upcoming && auction.status !== AuctionStatus.Active) {
    return (
      <div className="max-w-lg mx-auto py-8 px-4 text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          This auction is no longer accepting gate proofs.
        </p>
        <Link to={`/auctions/${auctionId}`} className="text-sm underline">
          Back to auction
        </Link>
      </div>
    );
  }

  const name = auction.metadata?.name ?? `${auctionId.slice(0, 16)}…`;

  return (
    <div className="max-w-lg mx-auto py-8 px-4 space-y-6">
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Gate Access</p>
        <h1 className="text-xl font-semibold">{name}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {auction.gateMode === GateMode.Merkle
            ? 'This auction requires a Merkle allowlist proof.'
            : 'This auction requires a credential issued by the creator.'}
        </p>
      </div>

      {auction.gateMode === GateMode.Merkle ? (
        <MerkleGateForm auctionId={auctionId} />
      ) : (
        <CredentialGateForm auctionId={auctionId} />
      )}

      <Link to={`/auctions/${auctionId}`} className="text-xs text-muted-foreground underline block">
        ← Back to auction
      </Link>
    </div>
  );
}
