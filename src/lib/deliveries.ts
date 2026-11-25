import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { decrypt } from './crypto.ts';
import { db } from './db.ts';

function privateAddress(address: string) {
  if (address === '::1' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:')) return true;
  const parts = address.split('.').map(Number);
  return isIP(address) === 4 && (parts[0] === 10 || parts[0] === 127 || parts[0] === 0
    || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168));
}

export async function assertSafeDestination(raw: string) {
  const url = new URL(raw);
  const local = process.env.LAB_ALLOW_PRIVATE_CALLBACKS === 'true'
    && ['localhost', '127.0.0.1', 'host.docker.internal'].includes(url.hostname);
  if ((!local && (url.protocol !== 'https:' || !['', '443'].includes(url.port))) || url.username || url.password) {
    throw new Error('destination_not_allowed');
  }
  if (!local) {
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(item => privateAddress(item.address))) throw new Error('destination_not_allowed');
  }
  return url;
}

export async function processDueDeliveries(limit = 10) {
  const sql = db();
  const claimed = await sql.begin(async transaction => {
    const rows = await transaction<({ id: string })[]>`
      select id from lab_private.deliveries where status = 'pending' and available_at <= now()
      order by available_at for update skip locked limit ${limit}`;
    if (!rows.length) return [];
    return transaction`update lab_private.deliveries set status = 'processing', attempt_count = attempt_count + 1, updated_at = now()
      where id in ${transaction(rows.map(row => row.id))}
      returning id, environment_id, command_id, destination_url, payload, attempt_count`;
  });
  let delivered = 0;
  for (const item of claimed) {
    try {
      const destination = await assertSafeDestination(String(item.destination_url));
      const credentials = await sql<({ token_b_ciphertext: string; token_b_iv: string; token_b_tag: string })[]>`
        select token_b_ciphertext, token_b_iv, token_b_tag from lab_private.credentials
        where environment_id = ${item.environment_id} and status = 'active'`;
      if (!credentials[0]) throw new Error('active_credentials_missing');
      const tokenB = decrypt({ ciphertext: credentials[0].token_b_ciphertext, iv: credentials[0].token_b_iv,
        tag: credentials[0].token_b_tag }, `${item.environment_id}:B`);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(destination, { method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { authorization: `Token ${tokenB}`, 'content-type': 'application/json', 'ocpi-version': '2.2.1' },
        body: JSON.stringify(item.payload) }).finally(() => clearTimeout(timer));
      if (!response.ok) throw new Error(`callback_http_${response.status}`);
      await sql.begin(async transaction => {
        await transaction`update lab_private.deliveries set status = 'delivered', updated_at = now() where id = ${item.id}`;
        await transaction`update lab_private.commands set callback_result = 'ACCEPTED', updated_at = now() where id = ${item.command_id}`;
        await transaction`insert into lab_private.receipts
          (environment_id, kind, request_id, correlation_id, direction, method, path, outcome, details)
          values (${item.environment_id}, 'callback', ${item.id}, ${item.command_id}, 'outbound', 'POST',
            ${destination.pathname}, 'delivered', ${transaction.json({ attempt: item.attempt_count })})`;
      });
      delivered++;
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0, 80) : 'delivery_failed';
      await sql`update lab_private.deliveries set status = case when attempt_count >= 5 then 'failed' else 'pending' end,
        available_at = now() + interval '30 seconds', last_error_code = ${code}, updated_at = now() where id = ${item.id}`;
    }
  }
  return { claimed: claimed.length, delivered };
}
