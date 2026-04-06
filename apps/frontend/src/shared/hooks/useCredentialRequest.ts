import { useState, useCallback }  from 'react';
import { useWallet }               from '@provablehq/aleo-wallet-adaptor-react';
import { buildCredentialChallenge } from '@fairdrop/sdk/hash';

export interface IssuedCredential {
  signature: string;
  expiry:    number;
  issuer:    string;
}

interface State {
  requesting: boolean;
  error:      string | null;
}

interface UseCredentialRequest {
  request:    (credentialUrl: string, auctionId: string) => Promise<IssuedCredential | null>;
  requesting: boolean;
  error:      string | null;
  clearError: () => void;
}

/**
 * Requests a gate credential from a credential-signer service.
 *
 * Flow:
 *   1. Signs the challenge string with the connected wallet.
 *   2. POSTs { auctionId, holderAddress, walletSignature } to <credentialUrl>/credentials/issue.
 *   3. Returns the issued credential on success, null on failure.
 */
export function useCredentialRequest(): UseCredentialRequest {
  const { address, signMessage } = useWallet();
  const [state, setState] = useState<State>({ requesting: false, error: null });

  const request = useCallback(async (
    credentialUrl: string,
    auctionId:     string,
  ): Promise<IssuedCredential | null> => {
    if (!address || !signMessage) {
      setState((s) => ({ ...s, error: 'Wallet not connected' }));
      return null;
    }

    setState({ requesting: true, error: null });

    try {
      // Step 1 — sign the challenge
      const challenge  = buildCredentialChallenge(auctionId, address);
      const sigBytes   = await signMessage(new TextEncoder().encode(challenge));
      if (!sigBytes) {
        setState({ requesting: false, error: 'Wallet signature was cancelled' });
        return null;
      }
      const walletSignature = new TextDecoder().decode(sigBytes);

      // Step 2 — request the credential
      const url = credentialUrl.replace(/\/$/, '');
      const res = await fetch(`${url}/credentials/issue`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ auctionId, holderAddress: address, walletSignature }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        const msg  = body.error ?? `Service returned ${res.status}`;
        setState({ requesting: false, error: msg });
        return null;
      }

      const credential = await res.json() as IssuedCredential;
      setState({ requesting: false, error: null });
      return credential;
    } catch (err) {
      setState({
        requesting: false,
        error: err instanceof Error ? err.message : 'Failed to request credential',
      });
      return null;
    }
  }, [address, signMessage]);

  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), []);

  return { request, requesting: state.requesting, error: state.error, clearError };
}
