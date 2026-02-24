import { promises as dns } from 'dns';

/**
 * Resolve TXT records for a host. Returns flattened array of string values.
 */
export async function dnsResolveTxt(host: string): Promise<string[]> {
  const records = await dns.resolveTxt(host);
  return records.flat();
}
