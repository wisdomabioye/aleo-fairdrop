/**
 * Token Manager — burn private token records and manage roles on token_registry.aleo.
 */
import { useState } from 'react';
import { useWallet }  from '@provablehq/aleo-wallet-adaptor-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Input,
  Label,
  PageHeader,
  Spinner,
  TokenAmountInput,
} from '@/components';
import { Flame, ShieldCheck, Info } from 'lucide-react';
import { SYSTEM_PROGRAMS } from '@fairdrop/sdk/constants';
import { parseTokenAmount } from '@fairdrop/sdk/format';
import { ConnectWalletPrompt } from '@/shared/components/wallet/ConnectWalletPrompt';
import { useTransactionStore } from '@/stores/transaction.store';
import { parseExecutionError } from '@/shared/utils/errors';
import { useTokenInfo } from '@/shared/hooks/useTokenInfo';
import { useTokenRecords } from '@/shared/hooks/useTokenRecords';
import type { WalletTokenRecord } from '@fairdrop/types/primitives';
import { TX_DEFAULT_FEE } from '@/env';

const TOKEN_REGISTRY = SYSTEM_PROGRAMS.tokenRegistry;

const ROLE_OPTIONS = [
  { value: 1, label: 'MINTER_ROLE (1)' },
  { value: 2, label: 'BURNER_ROLE (2)' },
  { value: 3, label: 'SUPPLY_MANAGER_ROLE (3)' },
];

// ── BurnTab ───────────────────────────────────────────────────────────────────

function BurnTab() {
  const { executeTransaction } = useWallet();
  const { setTx } = useTransactionStore();
  const { tokenRecords, loading: fetching, fetchRecords } = useTokenRecords({ fetchOnMount: false });

  const [tokenId, setTokenId]         = useState('');
  const [selectedRec, setSelectedRec] = useState<WalletTokenRecord | null>(null);
  const [amount, setAmount]           = useState('');
  const [busy, setBusy]               = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState<string | null>(null);

  const { data: tokenInfo } = useTokenInfo(tokenId.endsWith('field') ? tokenId : null);
  const decimals = tokenInfo?.decimals ?? 0;

  const filtered = tokenRecords.filter((r) => r.token_id === tokenId && !r.spent);

  async function handleFetch() {
    if (!tokenId.endsWith('field')) return;
    setError(null);
    setSelectedRec(null);
    try {
      await fetchRecords();
    } catch (err) {
      setError(err instanceof Error ? err.message : parseExecutionError(err));
    }
  }

  const recAmount = selectedRec?.amount ?? 0n;
  const rawAmount = parseTokenAmount(amount, decimals);
  const burnValid = !!selectedRec && rawAmount > 0n && rawAmount <= recAmount;

  async function handleBurn() {
    if (!burnValid || !selectedRec) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      const result = await executeTransaction({
        program:    TOKEN_REGISTRY,
        function:   'burn_private',
        inputs:     [selectedRec._record, `${rawAmount}u128`],
        fee:        TX_DEFAULT_FEE,
        privateFee: false,
      });
      if (result?.transactionId) {
        setTx(result.transactionId, 'Burn Tokens');
        setSuccess('Burn submitted. Remainder record will return to your wallet.');
        setSelectedRec(null);
        setAmount('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : parseExecutionError(err));
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-amber-400" />
        <p className="text-muted-foreground">
          Only the token admin or an account with <strong className="text-foreground">BURNER_ROLE</strong> can burn tokens.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Token ID</Label>
        <div className="flex gap-2">
          <Input
            className="flex-1 font-mono text-xs"
            placeholder="123...field"
            value={tokenId}
            onChange={(e) => { setTokenId(e.target.value); setSelectedRec(null); }}
          />
          <Button variant="outline" size="sm" onClick={handleFetch} disabled={!tokenId.endsWith('field') || fetching}>
            {fetching ? <Spinner className="size-4" /> : 'Fetch'}
          </Button>
        </div>
        {tokenInfo && (
          <p className="text-xs text-muted-foreground">
            Found: <strong className="text-foreground">{tokenInfo.name}</strong> ({tokenInfo.symbol}) · {tokenInfo.decimals} decimals
          </p>
        )}
      </div>

      {filtered.length > 0 && (
        <div className="space-y-1.5">
          <Label>Select Record</Label>
          <div className="space-y-1.5">
            {filtered.map((rec, i) => (
              <button
                key={rec.id}
                className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors
                  ${selectedRec?.id === rec.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'}`}
                onClick={() => setSelectedRec(rec)}
              >
                <span className="font-mono text-muted-foreground">Record {i + 1}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedRec && (
        <TokenAmountInput
          label="Amount to burn"
          value={amount}
          onChange={setAmount}
          decimals={decimals}
          symbol={tokenInfo?.symbol ?? undefined}
          max={recAmount}
          maxLabel="Burn all"
          error={rawAmount > recAmount ? 'Exceeds record amount' : undefined}
        />
      )}

      {error   && <p className="text-xs text-destructive">{error}</p>}
      {success && <p className="text-xs text-emerald-400">{success}</p>}

      <Button
        variant="destructive"
        className="w-full"
        onClick={handleBurn}
        disabled={!burnValid || busy}
      >
        {busy ? <><Spinner className="mr-2 size-4" /> Waiting for wallet…</> :
         !selectedRec ? 'Fetch records first' :
         rawAmount <= 0n ? 'Enter amount' : 'Burn Tokens'}
      </Button>
    </div>
  );
}

// ── RoleTab ───────────────────────────────────────────────────────────────────

function RoleTab() {
  const { executeTransaction } = useWallet();
  const { setTx } = useTransactionStore();

  const [tokenId,  setTokenId]  = useState('');
  const [account,  setAccount]  = useState('');
  const [role,     setRole]     = useState(1);
  const [action,   setAction]   = useState<'set' | 'remove'>('set');
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState<string | null>(null);

  const tokenOk = tokenId.trim().endsWith('field');
  const addrOk  = account.trim().startsWith('aleo1') && account.trim().length > 10;
  const valid   = tokenOk && addrOk;

  async function handleSubmit() {
    if (!valid) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      const fn     = action === 'set' ? 'set_role' : 'remove_role';
      const inputs = action === 'set'
        ? [tokenId.trim(), account.trim(), `${role}u8`]
        : [tokenId.trim(), account.trim()];

      const result = await executeTransaction({ 
        program: TOKEN_REGISTRY, 
        function: fn, 
        inputs, fee: TX_DEFAULT_FEE, 
        privateFee: false
      });
      if (result?.transactionId) {
        setTx(result.transactionId, action === 'set' ? 'Set Role' : 'Remove Role');
        setSuccess(action === 'set' ? 'Role assigned successfully.' : 'Role removed successfully.');
        setTokenId(''); setAccount('');
      }
    } catch (err) { 
      setError(err instanceof Error ? err.message : parseExecutionError(err)); 
     }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-3 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-muted-foreground">
          Only the address set as <strong className="text-foreground">admin</strong> on the token can assign or revoke roles.
        </p>
      </div>

      {/* Set / Remove toggle */}
      <div className="flex gap-2">
        {(['set', 'remove'] as const).map((a) => (
          <Button
            key={a}
            variant={action === a ? 'default' : 'outline'}
            size="sm"
            className="flex-1"
            onClick={() => setAction(a)}
          >
            {a === 'set' ? 'Assign Role' : 'Revoke Role'}
          </Button>
        ))}
      </div>

      {/* Token ID */}
      <div className="space-y-1.5">
        <Label>Token ID</Label>
        <Input
          className="font-mono text-xs"
          placeholder="123...field"
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value)}
        />
        {tokenId && !tokenOk && <p className="text-xs text-destructive">Must end with 'field'</p>}
      </div>

      {/* Account */}
      <div className="space-y-1.5">
        <Label>Account address</Label>
        <Input
          className="font-mono text-xs"
          placeholder="aleo1..."
          value={account}
          onChange={(e) => setAccount(e.target.value)}
        />
        {account && !addrOk && <p className="text-xs text-destructive">Invalid Aleo address</p>}
      </div>

      {/* Role selector (only for set) */}
      {action === 'set' && (
        <div className="space-y-1.5">
          <Label>Role</Label>
          <div className="grid grid-cols-3 gap-2">
            {ROLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors
                  ${role === opt.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}
                onClick={() => setRole(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {error   && <p className="text-xs text-destructive">{error}</p>}
      {success && <p className="text-xs text-emerald-400">{success}</p>}

      <Button className="w-full" onClick={handleSubmit} disabled={!valid || busy}>
        {busy
          ? <><Spinner className="mr-2 size-4" /> Waiting for wallet…</>
          : action === 'set' ? 'Assign Role' : 'Revoke Role'
        }
      </Button>
    </div>
  );
}

// ── TokenManagerPage ──────────────────────────────────────────────────────────

export function TokenManagerPage() {
  const { connected } = useWallet();

  if (!connected) {
    return (
      <div className="mx-auto max-w-xl space-y-6 p-6">
        <PageHeader title="Token Manager" description="Burn tokens and manage roles on token_registry.aleo." />
        <ConnectWalletPrompt message="Connect your wallet to manage tokens." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <PageHeader title="Token Manager" description="Burn tokens and manage roles on token_registry.aleo." />

      <Tabs defaultValue="roles">
        <TabsList className="w-full">
          <TabsTrigger value="roles" className="flex-1">
            <ShieldCheck className="mr-1.5 size-4" />
            Role Management
          </TabsTrigger>
          <TabsTrigger value="burn" className="flex-1">
            <Flame className="mr-1.5 size-4" />
            Burn Tokens
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roles">
          <Card>
            <CardHeader>
              <CardTitle>Role Management</CardTitle>
              <CardDescription>Assign or revoke minter, burner, or supply manager roles.</CardDescription>
            </CardHeader>
            <CardContent>
              <RoleTab />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="burn">
          <Card>
            <CardHeader>
              <CardTitle>Burn Tokens</CardTitle>
              <CardDescription>Permanently destroy a private token record. Returns any remainder to your wallet.</CardDescription>
            </CardHeader>
            <CardContent>
              <BurnTab />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
