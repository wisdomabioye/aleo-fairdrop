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
  /** Pin a binary file (image, etc.) and return the IPFS CID. */
  pinFile(blob: Blob, filename: string): Promise<string>;
}

export function createPinataClient(jwt: string): IpfsClient {
  async function pinataPost(url: string, init: RequestInit): Promise<string> {
    const res = await fetch(url, {
      ...init,
      headers: { 'Authorization': `Bearer ${jwt}`, ...init.headers },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`[ipfs] Pinata error ${res.status}: ${text}`);
    }
    const data = (await res.json()) as { IpfsHash: string };
    return data.IpfsHash;
  }

  return {
    pin(content, name) {
      return pinataPost('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ pinataContent: content, pinataMetadata: { name } }),
      });
    },

    pinFile(blob, filename) {
      const form = new FormData();
      form.append('file', blob, filename);
      form.append('pinataMetadata', JSON.stringify({ name: filename }));
      return pinataPost('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        body:   form,
      });
    },
  };
}
