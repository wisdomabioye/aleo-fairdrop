import { PrivateKey } from '@provablehq/sdk';
import { computeCredentialMsgHash } from '@fairdrop/sdk/hash';

export interface Credential {
  signature: string;
  expiry:    number;
  issuer:    string;
}

// Initialised once after WASM is ready — see index.ts
let _privateKey:    PrivateKey | undefined;
let _issuerAddress: string    | undefined;

/**
 * Must be called once after initializeWasm() resolves.
 * Parses the private key and derives the issuer address.
 */
export function initSigning(privateKeyStr: string): void {
  _privateKey    = PrivateKey.from_string(privateKeyStr);
  _issuerAddress = _privateKey.to_address().to_string();
}

function requireInitialized(): { privateKey: PrivateKey; address: string } {
  if (!_privateKey || !_issuerAddress) {
    throw new Error('[credential-signer] initSigning() must be called before issuing credentials');
  }
  return { privateKey: _privateKey, address: _issuerAddress };
}

export function issuerAddress(): string {
  return requireInitialized().address;
}

/**
 * Issue a credential for a verified bidder.
 *
 * Uses signValue() to sign the BHP256 field literal — matches
 * the Leo signature::verify(sig, issuer, msg) on-chain check.
 */
export function issueCredential(
  holderAddress: string,
  auctionId:     string,
  expiry:        number,
): Credential {
  const { privateKey, address } = requireInitialized();
  const msgHash   = computeCredentialMsgHash(holderAddress, auctionId, expiry);
  const sig       = privateKey.signValue(msgHash);

  return { signature: sig.toString(), expiry, issuer: address };
}
