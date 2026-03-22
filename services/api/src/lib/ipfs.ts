/**
 * IPFS pinning abstraction.
 *
 * IpfsClient is a provider-agnostic interface — only the Pinata implementation
 * is wired up today. Swap createPinataClient() for another provider by
 * implementing the same interface in a new factory function.
 */

export interface IpfsClient {
  /** Pin a JSON object and return the IPFS CID. */
  pin(content: Record<string, unknown>, name: string): Promise<string>;
}

export function createPinataClient(jwt: string): IpfsClient {
  return {
    async pin(content, name) {
      const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          pinataContent:  content,
          pinataMetadata: { name },
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`[ipfs] Pinata error ${res.status}: ${text}`);
      }

      const data = (await res.json()) as { IpfsHash: string };
      return data.IpfsHash;
    },
  };
}
