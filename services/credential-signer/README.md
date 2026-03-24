# services/credential-signer

Issues gate credentials to users who pass an identity check. Separated into its own process because it holds a private key — the smaller the attack surface, the better.

## Flow

1. User hits `POST /credentials/issue` with proof of identity (e.g. signed message, KYC token).
2. Signer verifies the proof against the configured identity provider.
3. Signer generates a `GateCredential` Leo record signed with the issuer key.
4. Record ciphertext is returned to the user; they spend it on-chain inside `place_bid_*`.

The issuer public key must match the address registered in `fairdrop_gate_v1.aleo` for the target auction's gate config.

## Security

- Private key is loaded from environment only — never written to disk or logs.
- No DB dependency — stateless per request.
- Credentials are single-use on-chain; re-issuance requires a new identity check.

## Status

Not yet implemented.
