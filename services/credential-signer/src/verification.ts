import { Signature, Address } from '@provablehq/sdk';
import { buildCredentialChallenge } from '@fairdrop/sdk/hash';

/**
 * Verify that walletSignature was produced by the private key behind holderAddress
 * signing the credential challenge for this auctionId.
 *
 * The wallet signs the UTF-8 bytes of the challenge string.
 * address.verify(bytes, sig) checks the signature without any Leo-specific encoding.
 *
 * Throws if verification fails.
 */
export function verifyWalletOwnership(
  holderAddress:   string,
  auctionId:       string,
  walletSignature: string,
): void {
  const challenge = buildCredentialChallenge(auctionId, holderAddress);
  const bytes     = new TextEncoder().encode(challenge);
  const sig       = Signature.from_string(walletSignature);
  const address   = Address.from_string(holderAddress);
  const valid     = address.verify(bytes, sig);

  if (!valid) {
    throw new Error('Wallet signature verification failed');
  }
}
