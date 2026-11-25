import { randomBytes, randomUUID } from 'node:crypto';
import { config, hashSecret } from './config.ts';
import { db } from './db.ts';
import { decrypt, encrypt, freshToken, tokenHint, tokenMatches } from './crypto.ts';
import { assertSafeDestination } from './deliveries.ts';
import type { EnvironmentView, OcpiRole, Scenario } from './ocpi.ts';
import { moduleDirection } from './ocpi.ts';

type EnvironmentRow = {
  id: string; slug: string; name: string; country_code: string; party_id: string; role: OcpiRole;
  supported_modules: string[]; scenario: Scenario; status: EnvironmentView['status'];
  credential_generation: number; bootstrap_consumed_at: string | null; bootstrap_token_hint: string; expires_at: string;
  owner_id: string | null;
};

function view(row: EnvironmentRow): EnvironmentView {
  return {
    id: row.id, slug: row.slug, name: row.name, countryCode: row.country_code, partyId: row.party_id,
    role: row.role, modules: row.supported_modules, scenario: row.scenario, status: row.status,
    credentialGeneration: row.credential_generation,
    tokenAState: row.bootstrap_consumed_at ? 'consumed' : 'ready', tokenAHint: row.bootstrap_token_hint,
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

export async function createEnvironment(input: {
  name: string; countryCode: string; partyId: string; role: OcpiRole; modules: string[]; scenario: Scenario;
  ownerId: string;
}) {
  const sql = db();
  const count = await sql<{ count: number }[]>`select count(*)::int as count from lab_private.environments where status = 'active' and expires_at > now() and owner_id = ${input.ownerId}`;
  if (count[0].count >= config().LAB_MAX_ENVIRONMENTS) throw new Error('environment_capacity_reached');
  const slug = randomBytes(9).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(12, '0').slice(0, 12);
  const tokenA = freshToken(24);
  const rows = await sql<EnvironmentRow[]>`
    insert into lab_private.environments
      (slug, name, country_code, party_id, role, supported_modules, scenario, bootstrap_token_hash,
       bootstrap_token_hint, expires_at, owner_id)
    values
      (${slug}, ${input.name}, ${input.countryCode}, ${input.partyId}, ${input.role}, ${input.modules},
       ${input.scenario}, ${hashSecret(tokenA)}, ${tokenHint(tokenA)},
       now() + (${config().LAB_ENVIRONMENT_TTL_HOURS}::text || ' hours')::interval, ${input.ownerId})
    returning *`;
  return { environment: view(rows[0]), tokenA };
}

export async function getEnvironment(slug: string): Promise<EnvironmentView | null> {
  const rows = await db()<EnvironmentRow[]>`
    update lab_private.environments
       set status = case when expires_at <= now() then 'expired' else status end,
           updated_at = now()
     where slug = ${slug}
     returning *`;
  return rows[0] ? view(rows[0]) : null;
}

export async function listEnvironments(): Promise<EnvironmentView[]> {
  const rows = await db()<EnvironmentRow[]>`select * from lab_private.environments order by created_at desc limit 100`;
  return rows.map(view);
}

export async function authenticate(environment: EnvironmentView, token: string | null) {
  if (!token || environment.status === 'expired') return { kind: 'invalid' as const };
  const rows = await db()<({ bootstrap_token_hash: string; token_c_hash: string | null })[]>`
    select e.bootstrap_token_hash, c.token_c_hash
      from lab_private.environments e
      left join lab_private.credentials c on c.environment_id = e.id and c.status = 'active'
     where e.id = ${environment.id}`;
  if (!rows[0]) return { kind: 'invalid' as const };
  if (environment.tokenAState === 'ready' && tokenMatches(token, rows[0].bootstrap_token_hash)) return { kind: 'A' as const };
  if (rows[0].token_c_hash && tokenMatches(token, rows[0].token_c_hash)) return { kind: 'C' as const };
  return { kind: 'invalid' as const };
}

export async function registerCredentials(input: {
  environment: EnvironmentView; tokenB: string; peerUrl: string; roles: unknown[];
  method: 'POST' | 'PUT'; requestId: string; correlationId: string;
  verifiedPeer: { versionUrl: string; endpoints: Array<{ identifier: string; role: string; url: string }> };
}) {
  const sql = db();
  const tokenC = freshToken(32);
  const b = encrypt(input.tokenB, `${input.environment.id}:B`);
  const c = encrypt(tokenC, `${input.environment.id}:C`);
  const result = await sql.begin(async transaction => {
    const claimed = input.method === 'POST'
      ? await transaction<{ id: string }[]>`
          update lab_private.environments set bootstrap_consumed_at = now(), credential_generation = credential_generation + 1,
            status = 'active', updated_at = now()
          where id = ${input.environment.id} and bootstrap_consumed_at is null and expires_at > now()
          returning id`
      : await transaction<{ id: string }[]>`
          update lab_private.environments set credential_generation = credential_generation + 1, status = 'active', updated_at = now()
          where id = ${input.environment.id} and bootstrap_consumed_at is not null and expires_at > now()
          returning id`;
    if (!claimed[0]) return null;
    await transaction`
      insert into lab_private.credentials
        (environment_id, token_b_ciphertext, token_b_iv, token_b_tag, token_c_hash, token_c_ciphertext,
         token_c_iv, token_c_tag, peer_versions_url, peer_version_url, peer_endpoints, peer_roles, status)
      values
        (${input.environment.id}, ${b.ciphertext}, ${b.iv}, ${b.tag}, ${hashSecret(tokenC)}, ${c.ciphertext},
         ${c.iv}, ${c.tag}, ${input.peerUrl}, ${input.verifiedPeer.versionUrl},
         ${transaction.json(input.verifiedPeer.endpoints)}, ${transaction.json(input.roles)}, 'active')
      on conflict (environment_id) do update set
        token_b_ciphertext = excluded.token_b_ciphertext, token_b_iv = excluded.token_b_iv,
        token_b_tag = excluded.token_b_tag, token_c_hash = excluded.token_c_hash,
        token_c_ciphertext = excluded.token_c_ciphertext, token_c_iv = excluded.token_c_iv,
        token_c_tag = excluded.token_c_tag, peer_versions_url = excluded.peer_versions_url,
        peer_version_url = excluded.peer_version_url, peer_endpoints = excluded.peer_endpoints,
        peer_roles = excluded.peer_roles, status = 'active', updated_at = now()`;
    await transaction`
      insert into lab_private.receipts
        (environment_id, kind, request_id, correlation_id, direction, method, path, outcome, details)
      values (${input.environment.id}, 'credentials', ${input.requestId}, ${input.correlationId}, 'inbound',
        ${input.method}, '/2.2.1/credentials', 'accepted',
        ${transaction.json({ tokenB: tokenHint(input.tokenB), tokenC: tokenHint(tokenC), peerUrl: input.peerUrl,
          verifiedEndpoints: input.verifiedPeer.endpoints.length })})`;
    return tokenC;
  });
  return result;
}

export async function disconnect(environment: EnvironmentView, requestId: string, correlationId: string) {
  const sql = db();
  await sql.begin(async transaction => {
    await transaction`update lab_private.credentials set status = 'revoked', updated_at = now() where environment_id = ${environment.id}`;
    await transaction`update lab_private.environments set status = 'disconnected', updated_at = now() where id = ${environment.id}`;
    await transaction`insert into lab_private.receipts
      (environment_id, kind, request_id, correlation_id, direction, method, path, outcome)
      values (${environment.id}, 'credentials', ${requestId}, ${correlationId}, 'inbound', 'DELETE', '/2.2.1/credentials', 'disconnected')`;
  });
}

export async function currentCredential(environment: EnvironmentView) {
  const rows = await db()<({
    token_c_ciphertext: string; token_c_iv: string; token_c_tag: string;
  })[]>`select token_c_ciphertext, token_c_iv, token_c_tag from lab_private.credentials
    where environment_id = ${environment.id} and status = 'active'`;
  if (!rows[0]) return null;
  return decrypt({
    ciphertext: rows[0].token_c_ciphertext,
    iv: rows[0].token_c_iv,
    tag: rows[0].token_c_tag,
  }, `${environment.id}:C`);
}

export async function receipts(environmentId: string) {
  return db()`select id, kind, request_id, correlation_id, direction, method, path, outcome, details, created_at
    from lab_private.receipts where environment_id = ${environmentId} order by created_at desc limit 100`;
}

export async function cleanupExpired() {
  const result = await db()`update lab_private.environments set status = 'expired', updated_at = now()
    where expires_at <= now() and status <> 'expired' returning id`;
  return result.length;
}

export async function moduleObjects(environmentId: string, moduleName: 'sessions' | 'cdrs') {
  const rows = await db()<({ id: string; payload: Record<string, unknown> })[]>`
    select object_id as id, payload from lab_private.synthetic_objects
    where environment_id = ${environmentId} and module = ${moduleName} order by created_at`;
  return rows.map(row => ({ id: row.id, ...row.payload }));
}

export async function upsertModuleObject(environmentId: string, moduleName: 'sessions' | 'cdrs', objectId: string, payload: Record<string, unknown>) {
  return db()`insert into lab_private.synthetic_objects (environment_id, module, object_id, payload)
    values (${environmentId}, ${moduleName}, ${objectId}, ${JSON.stringify(payload)})
    on conflict (environment_id, module, object_id) do update set
      payload = excluded.payload, updated_at = now()`;
}

export async function deleteModuleObject(environmentId: string, moduleName: 'sessions' | 'cdrs', objectId: string) {
  return db()`delete from lab_private.synthetic_objects
    where environment_id = ${environmentId} and module = ${moduleName} and object_id = ${objectId}`;
}

export async function createSyntheticCommand(input: {
  environment: EnvironmentView;
  command: 'START_SESSION' | 'STOP_SESSION';
  responseUrl: string;
  authorizationReference?: string;
  requestedSessionId?: string;
  requestId: string;
  correlationId: string;
}) {
  const sql = db();
  const scenarioResult = input.environment.scenario === 'rejected' ? 'REJECTED'
    : input.environment.scenario === 'timeout' ? 'TIMEOUT' : 'ACCEPTED';
  try { await assertSafeDestination(input.responseUrl); }
  catch { throw new Error('callback_destination_not_allowed'); }
  return sql.begin(async transaction => {
    const sessionId = input.requestedSessionId ?? randomUUID();
    if (input.command === 'STOP_SESSION') {
      const existing = await transaction<{ payload: Record<string, unknown> }[]>`
        select payload from lab_private.synthetic_objects where environment_id = ${input.environment.id}
          and module = 'sessions' and object_id = ${sessionId}`;
      if (!existing[0] || existing[0].payload.status !== 'ACTIVE') throw new Error('active_session_required');
    }
    const commands = await transaction<{ id: string }[]>`
      insert into lab_private.commands
        (environment_id, command, response_url, authorization_reference, session_id, immediate_result)
      values (${input.environment.id}, ${input.command}, ${input.responseUrl},
        ${input.authorizationReference ?? null}, ${sessionId}, ${scenarioResult}) returning id`;
    const commandId = commands[0].id;
    if (scenarioResult === 'ACCEPTED') {
      const now = new Date().toISOString();
      if (input.command === 'START_SESSION') {
        const session = {
          country_code: input.environment.countryCode, party_id: input.environment.partyId, id: sessionId,
          start_date_time: now, kwh: 0, cdr_token: { country_code: input.environment.countryCode,
            party_id: input.environment.partyId, uid: 'SYNTHETIC-TOKEN-1', type: 'APP_USER' },
          auth_method: 'COMMAND', authorization_reference: input.authorizationReference,
          location_id: 'LAB-LOCATION-1', evse_uid: 'LAB-EVSE-1', connector_id: '1',
          currency: 'EUR', status: 'ACTIVE', last_updated: now,
        };
        await transaction`insert into lab_private.synthetic_objects (environment_id, module, object_id, payload)
          values (${input.environment.id}, 'sessions', ${sessionId}, ${transaction.json(session)})`;
      } else {
        const existing = await transaction<{ payload: Record<string, unknown> }[]>`
          select payload from lab_private.synthetic_objects where environment_id = ${input.environment.id}
            and module = 'sessions' and object_id = ${sessionId} for update`;
        const previous = existing[0].payload;
        const completed: Record<string, unknown> = { ...previous, status: 'COMPLETED', kwh: 4.2, last_updated: now };
        await transaction`update lab_private.synthetic_objects set payload = ${transaction.json(completed)}, updated_at = now()
          where environment_id = ${input.environment.id} and module = 'sessions' and object_id = ${sessionId}`;
        const cdrId = `CDR-${sessionId}`.slice(0, 128);
        const cdr = {
          country_code: input.environment.countryCode, party_id: input.environment.partyId, id: cdrId,
          session_id: sessionId, start_date_time: previous.start_date_time, end_date_time: now,
          cdr_token: previous.cdr_token, auth_method: 'COMMAND', authorization_reference: previous.authorization_reference,
          cdr_location: { id: 'LAB-LOCATION-1', name: 'Allspark Synthetic Charging Lab', address: '1 Interoperability Way',
            city: 'Dublin', country: 'IRL', coordinates: { latitude: '53.3498', longitude: '-6.2603' },
            evse_uid: 'LAB-EVSE-1', evse_id: `${input.environment.countryCode}*${input.environment.partyId}*ELAB1`,
            connector_id: '1', connector_standard: 'IEC_62196_T2_COMBO', connector_format: 'CABLE', connector_power_type: 'DC' },
          currency: 'EUR', tariffs: [], charging_periods: [], total_cost: { excl_vat: 2.1, incl_vat: 2.58 },
          total_energy: 4.2, total_time: 0.2, last_updated: now,
        };
        await transaction`insert into lab_private.synthetic_objects (environment_id, module, object_id, payload)
          values (${input.environment.id}, 'cdrs', ${cdrId}, ${transaction.json(cdr)})`;
      }
      const delaySeconds = input.environment.scenario === 'delayed' ? 5 : 0;
      await transaction`insert into lab_private.deliveries
        (environment_id, command_id, destination_url, payload, available_at)
        values (${input.environment.id}, ${commandId}, ${input.responseUrl},
          ${transaction.json({ result: 'ACCEPTED', timeout: 30, message: 'Synthetic command completed' })},
          now() + (${delaySeconds}::text || ' seconds')::interval)`;
    }
    await transaction`insert into lab_private.receipts
      (environment_id, kind, request_id, correlation_id, direction, method, path, outcome, details)
      values (${input.environment.id}, 'command', ${input.requestId}, ${input.correlationId}, 'inbound', 'POST',
        ${`/2.2.1/commands/${input.command}`}, ${scenarioResult.toLowerCase()},
        ${transaction.json({ commandId, sessionId, scenario: input.environment.scenario })})`;
    return { commandId, sessionId, result: scenarioResult };
  });
}

export function trace(request: Request) {
  const requestId = request.headers.get('x-request-id')?.slice(0, 128) || randomUUID();
  const correlationId = request.headers.get('x-correlation-id')?.slice(0, 128) || requestId;
  return { requestId, correlationId };
}

export async function sendCommand(input: {
  environment: EnvironmentView;
  command: 'START_SESSION' | 'STOP_SESSION';
  peerUrl: string;
  responseUrl: string;
  authorizationReference?: string;
  requestedSessionId?: string;
  requestId: string;
  correlationId: string;
}) {
  if (moduleDirection(input.environment.role, 'commands') !== 'SENDER') {
    throw new Error('role_not_authorized_for_commands');
  }
  const sql = db();
  const tokenC = await currentCredential(input.environment);
  if (!tokenC) throw new Error('no_active_token_c');
  try { await assertSafeDestination(input.peerUrl); }
  catch { throw new Error('peer_destination_not_allowed'); }
  const destination = new URL(input.peerUrl);
  if (destination.pathname.endsWith('/')) destination.pathname = destination.pathname.slice(0, -1);
  const commandPath = `/2.2.1/commands/${input.command}`;
  const fullUrl = `${destination.origin}${commandPath}`;
  const body: Record<string, unknown> = { response_url: input.responseUrl };
  if (typeof input.authorizationReference === 'string') body.authorization_reference = input.authorizationReference;
  if (typeof input.requestedSessionId === 'string') body.session_id = input.requestedSessionId;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let immediateResult: 'ACCEPTED' | 'REJECTED' | 'TIMEOUT';
  try {
    const response = await fetch(fullUrl, {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { authorization: `Token ${tokenC}`, 'content-type': 'application/json', 'ocpi-version': '2.2.1' },
      body: JSON.stringify(body),
    }).finally(() => clearTimeout(timer));
    if (!response.ok) immediateResult = 'REJECTED';
    else {
      const result = await response.json() as { result?: string };
      immediateResult = (result.result === 'ACCEPTED' || result.result === 'REJECTED' || result.result === 'TIMEOUT')
        ? result.result as 'ACCEPTED' | 'REJECTED' | 'TIMEOUT' : 'ACCEPTED';
    }
  } catch {
    immediateResult = 'TIMEOUT';
  }
  return sql.begin(async transaction => {
    const sessionId = input.requestedSessionId ?? randomUUID();
    const commands = await transaction<{ id: string }[]>`
      insert into lab_private.commands
        (environment_id, command, response_url, authorization_reference, session_id, immediate_result)
      values (${input.environment.id}, ${input.command}, ${input.responseUrl},
        ${input.authorizationReference ?? null}, ${sessionId}, ${immediateResult}) returning id`;
    const commandId = commands[0].id;
    if (immediateResult === 'ACCEPTED') {
      const now = new Date().toISOString();
      if (input.command === 'START_SESSION') {
        const session = {
          country_code: input.environment.countryCode, party_id: input.environment.partyId, id: sessionId,
          start_date_time: now, kwh: 0, cdr_token: { country_code: input.environment.countryCode,
            party_id: input.environment.partyId, uid: 'SYNTHETIC-TOKEN-1', type: 'APP_USER' },
          auth_method: 'COMMAND', authorization_reference: input.authorizationReference,
          location_id: 'LAB-LOCATION-1', evse_uid: 'LAB-EVSE-1', connector_id: '1',
          currency: 'EUR', status: 'ACTIVE', last_updated: now,
        };
        await transaction`insert into lab_private.synthetic_objects (environment_id, module, object_id, payload)
          values (${input.environment.id}, 'sessions', ${sessionId}, ${transaction.json(session)})`;
      } else {
        const existing = await transaction<{ payload: Record<string, unknown> }[]>`
          select payload from lab_private.synthetic_objects where environment_id = ${input.environment.id}
            and module = 'sessions' and object_id = ${sessionId} for update`;
        if (!existing[0] || existing[0].payload.status !== 'ACTIVE') throw new Error('active_session_required');
        const previous = existing[0].payload;
        const completed: Record<string, unknown> = { ...previous, status: 'COMPLETED', kwh: 4.2, last_updated: now };
        await transaction`update lab_private.synthetic_objects set payload = ${transaction.json(completed)}, updated_at = now()
          where environment_id = ${input.environment.id} and module = 'sessions' and object_id = ${sessionId}`;
        const cdrId = `CDR-${sessionId}`.slice(0, 128);
        const cdr = {
          country_code: input.environment.countryCode, party_id: input.environment.partyId, id: cdrId,
          session_id: sessionId, start_date_time: previous.start_date_time, end_date_time: now,
          cdr_token: previous.cdr_token, auth_method: 'COMMAND', authorization_reference: previous.authorization_reference,
          cdr_location: { id: 'LAB-LOCATION-1', name: 'Allspark Synthetic Charging Lab', address: '1 Interoperability Way',
            city: 'Dublin', country: 'IRL', coordinates: { latitude: '53.3498', longitude: '-6.2603' },
            evse_uid: 'LAB-EVSE-1', evse_id: `${input.environment.countryCode}*${input.environment.partyId}*ELAB1`,
            connector_id: '1', connector_standard: 'IEC_62196_T2_COMBO', connector_format: 'CABLE', connector_power_type: 'DC' },
          currency: 'EUR', tariffs: [], charging_periods: [], total_cost: { excl_vat: 2.1, incl_vat: 2.58 },
          total_energy: 4.2, total_time: 0.2, last_updated: now,
        };
        await transaction`insert into lab_private.synthetic_objects (environment_id, module, object_id, payload)
          values (${input.environment.id}, 'cdrs', ${cdrId}, ${transaction.json(cdr)})`;
      }
    }
    await transaction`insert into lab_private.receipts
      (environment_id, kind, request_id, correlation_id, direction, method, path, outcome, details)
      values (${input.environment.id}, 'command', ${input.requestId}, ${input.correlationId}, 'outbound', 'POST',
        ${commandPath}, ${immediateResult.toLowerCase()},
        ${transaction.json({ commandId, sessionId, peerUrl: input.peerUrl, immediateResult })})`;
    return { commandId, sessionId, result: immediateResult };
  });
}

export async function commandStatus(environmentId: string, commandId: string) {
  const rows = await db()<({
    id: string; command: string; response_url: string; authorization_reference: string | null;
    session_id: string | null; immediate_result: string; callback_result: string | null;
    created_at: string; updated_at: string;
  })[]>`
    select id, command, response_url, authorization_reference, session_id, immediate_result,
      callback_result, created_at, updated_at
    from lab_private.commands where id = ${commandId} and environment_id = ${environmentId}`;
  return rows[0] ?? null;
}

export async function commandsList(environmentId: string) {
  return db()`select id, command, immediate_result, callback_result, session_id, created_at, updated_at
    from lab_private.commands where environment_id = ${environmentId}
    order by created_at desc limit 100`;
}

export async function tracesList(environmentId: string) {
  return db()`select id, kind, request_id, correlation_id, direction, method, path, outcome, details, created_at
    from lab_private.receipts where environment_id = ${environmentId}
    order by created_at desc limit 200`;
}

export async function traceDetail(environmentId: string, traceId: string) {
  const rows = await db()<({ id: string; kind: string; request_id: string; correlation_id: string;
    direction: string; method: string | null; path: string | null; outcome: string;
    details: Record<string, unknown>; created_at: string })[]>`
    select id, kind, request_id, correlation_id, direction, method, path, outcome, details, created_at
    from lab_private.receipts where id = ${traceId} and environment_id = ${environmentId}`;
  return rows[0] ?? null;
}
