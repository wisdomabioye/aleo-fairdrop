import { useState }        from 'react';
import { Button, Input, Label, Spinner } from '@/components';

interface Props {
  onAddressResolved: (address: string) => void;
  onUrlChanged?:     (url: string) => void;
}

interface PublicKeyResponse {
  address: string;
}

async function fetchIssuerAddress(serviceUrl: string): Promise<string> {
  const url  = serviceUrl.replace(/\/$/, '');
  const res  = await fetch(`${url}/public-key`);
  if (!res.ok) throw new Error(`Service returned ${res.status}`);
  const data = await res.json() as PublicKeyResponse;
  if (!data.address?.startsWith('aleo1')) throw new Error('Invalid address in response');
  return data.address;
}

export function CredentialIssuerSetup({ onAddressResolved, onUrlChanged }: Props) {
  const [serviceUrl, setServiceUrl] = useState('');
  const [address,    setAddress]    = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  async function handleFetch() {
    const trimmed = serviceUrl.trim();
    if (!trimmed) return;
    setError(null);
    setLoading(true);
    try {
      const resolved = await fetchIssuerAddress(trimmed);
      setAddress(resolved);
      onAddressResolved(resolved);
      onUrlChanged?.(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch issuer address');
    } finally {
      setLoading(false);
    }
  }

  function handleManualEntry(value: string) {
    setAddress(value);
    setError(null);
    if (value.startsWith('aleo1')) {
      onAddressResolved(value);
    }
  }

  function handleServiceUrlChange(value: string) {
    setServiceUrl(value);
    onUrlChanged?.(value.trim());
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Credential signer URL</Label>
        <div className="flex gap-2">
          <Input
            value={serviceUrl}
            onChange={(e) => handleServiceUrlChange(e.target.value)}
            placeholder="https://your-credential-signer.example.com"
            disabled={loading}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleFetch}
            disabled={loading || !serviceUrl.trim()}
          >
            {loading ? <Spinner className="size-4" /> : 'Fetch'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          The URL where your credential-signer service is running.
        </p>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="space-y-1.5">
        <Label>Issuer address</Label>
        <Input
          value={address}
          onChange={(e) => handleManualEntry(e.target.value)}
          placeholder="aleo1…"
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Auto-filled from your service, or paste directly if you know it.
        </p>
      </div>
    </div>
  );
}
