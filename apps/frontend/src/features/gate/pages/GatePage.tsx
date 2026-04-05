import { useState, useRef, useEffect } from 'react';
import { Link, useParams }             from 'react-router-dom';
import { useWallet }                   from '@provablehq/aleo-wallet-adaptor-react';
import { Button, Input, Label, Spinner, Skeleton, Textarea } from '@/components';
import { isValidField }                from '@fairdrop/sdk/parse';
import { verifyMerkle, verifyCredential } from '@fairdrop/sdk/transactions';
import { fetchGateConfig }             from '@fairdrop/sdk/chain';
import { GateMode, AuctionStatus }     from '@fairdrop/types/domain';
import { AppRoutes }                   from '@/config';
import { parseExecutionError }         from '@/shared/utils/errors';
import { useConfirmedSequentialTx }    from '@/shared/hooks/useConfirmedSequentialTx';
import { ConnectWalletPrompt }         from '@/shared/components/wallet/ConnectWalletPrompt';
import { useAuction }                  from '../../auctions/hooks/useAuction';

// ── Merkle gate form ──────────────────────────────────────────────────────────

function MerkleGateForm({ auctionId }: { auctionId: string }) {
  const { connected, executeTransaction } = useWallet();

  const [proofJson,  setProofJson]  = useState('');
  const [parseError, setParseError] = useState('');
  const parsedRef = useRef<{ siblings: string[]; pathBits: number } | null>(null);

  const tx = useConfirmedSequentialTx([{
    label: 'Prove Merkle gate',
    execute: async () => {
      const parsed = parsedRef.current;
      if (!parsed) throw new Error('Proof not parsed');
      const spec   = verifyMerkle(auctionId, parsed.siblings, parsed.pathBits);
      const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
      return result?.transactionId;
    },
  }]);

  if (!connected) {
    return <ConnectWalletPrompt message="Connect your wallet to submit your Merkle proof." />;
  }

  if (tx.done) {
    return (
      <p className="text-sm text-emerald-600 dark:text-emerald-400">
        Proof submitted. Your gate token will appear in your wallet once confirmed.
      </p>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setParseError('');

    let raw: { leaf?: string; siblings: string[]; path_bits: (string | boolean)[] };
    try {
      raw = JSON.parse(proofJson);
      if (!Array.isArray(raw.siblings) || !Array.isArray(raw.path_bits)) {
        throw new Error('Missing required fields: siblings, path_bits');
      }
      if (raw.siblings.length !== 20) {
        throw new Error(`siblings must have exactly 20 elements (got ${raw.siblings.length})`);
      }
    } catch (err) {
      setParseError(`Invalid proof JSON: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    // Pack path_bits boolean array → u32
    const pathBits = raw.path_bits.reduce((acc: number, bit: string | boolean, i: number) =>
      (bit === true || bit === 'true') ? acc | (1 << i) : acc, 0);

    parsedRef.current = { siblings: raw.siblings, pathBits };
    tx.advance();
  }

  const busy     = tx.busy || tx.isWaiting;
  const errorMsg = parseError || (tx.error ? parseExecutionError(tx.error) : '');

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="merkle-proof">Merkle Proof (JSON)</Label>
        <Textarea
          id="merkle-proof"
          rows={8}
          placeholder={`{\n  "siblings": ["0field", "123...field", ...],\n  "path_bits": [false, true, ...]\n}`}
          value={proofJson}
          onChange={(e) => setProofJson(e.target.value)}
          className="font-mono text-xs"
          disabled={busy}
        />
        <p className="text-xs text-muted-foreground">
          20-element Merkle proof provided by the auction creator or their allowlist tooling.
        </p>
      </div>

      {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}

      <Button type="submit" disabled={busy || !proofJson.trim()}>
        {busy ? <><Spinner className="mr-2 h-4 w-4" />Submitting…</> : 'Submit Proof'}
      </Button>
    </form>
  );
}

// ── Credential gate form ──────────────────────────────────────────────────────

function CredentialGateForm({ auctionId }: { auctionId: string }) {
  const { connected, executeTransaction } = useWallet();

  const [issuer,     setIssuer]     = useState<string | null>(null);
  const [credJson,   setCredJson]   = useState('');
  const [parseError, setParseError] = useState('');
  const parsedRef = useRef<{ signature: string; expiry: number } | null>(null);

  // Fetch the credential issuer address from chain
  useEffect(() => {
    fetchGateConfig(auctionId)
      .then((cfg) => setIssuer(cfg?.issuer ?? null))
      .catch(() => setIssuer(null));
  }, [auctionId]);

  const tx = useConfirmedSequentialTx([{
    label: 'Prove credential gate',
    execute: async () => {
      const parsed = parsedRef.current;
      if (!parsed) throw new Error('Credential not parsed');
      if (!issuer)  throw new Error('Issuer address not loaded');
      const spec   = verifyCredential(auctionId, issuer, parsed.signature, parsed.expiry);
      const result = await executeTransaction({ ...spec, inputs: spec.inputs as string[] });
      return result?.transactionId;
    },
  }]);

  if (!connected) {
    return <ConnectWalletPrompt message="Connect your wallet to submit your credential." />;
  }

  if (tx.done) {
    return (
      <p className="text-sm text-emerald-600 dark:text-emerald-400">
        Credential submitted. Your gate token will appear in your wallet once confirmed.
      </p>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setParseError('');

    let raw: { signature: string; expiry: number };
    try {
      raw = JSON.parse(credJson);
      if (!raw.signature || typeof raw.expiry !== 'number') {
        throw new Error('Missing required fields: signature (string), expiry (number)');
      }
    } catch (err) {
      setParseError(`Invalid credential JSON: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    parsedRef.current = { signature: raw.signature, expiry: raw.expiry };
    tx.advance();
  }

  const busy     = tx.busy || tx.isWaiting;
  const errorMsg = parseError || (tx.error ? parseExecutionError(tx.error) : '');

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Issuer (read-only, fetched from chain) */}
      <div className="space-y-1.5">
        <Label>Credential Issuer</Label>
        {issuer === null ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Spinner className="size-3" /> Fetching issuer…
          </div>
        ) : (
          <Input value={issuer} readOnly className="font-mono text-xs" />
        )}
        <p className="text-xs text-muted-foreground">
          Only credentials signed by this address are accepted.
        </p>
      </div>

      {/* Credential JSON */}
      <div className="space-y-1.5">
        <Label htmlFor="cred-json">Credential (JSON)</Label>
        <Textarea
          id="cred-json"
          rows={5}
          placeholder={`{\n  "signature": "sign1...",\n  "expiry": 1234567\n}`}
          value={credJson}
          onChange={(e) => setCredJson(e.target.value)}
          className="font-mono text-xs"
          disabled={busy}
        />
        <p className="text-xs text-muted-foreground">
          Provided by the auction creator. Contains your issuer-signed credential and its expiry block.
        </p>
      </div>

      {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}

      <Button type="submit" disabled={busy || !credJson.trim() || !issuer}>
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
