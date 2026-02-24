import assert from 'node:assert/strict';
import test from 'node:test';

import { DatagranApiError, DatagranClient } from './datagranClient';
import { parseConnectInput, parseIngestInput, parseQueryInput, resolvePluginConfig } from './schemas';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function withMockFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  run: () => Promise<void>
): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('resolvePluginConfig reads nested plugins.entries config', () => {
  const config = resolvePluginConfig({
    plugins: {
      entries: {
        'datagran-memory': {
          config: {
            baseUrl: 'https://api.datagran.com/',
            apiKey: 'sk_live_123456',
            defaults: { mindState: 'auto', maxTokens: 256, temperature: 0.1 },
            http: { timeoutMs: 5000, retries: 1 },
          },
        },
      },
    },
  });

  assert.equal(config.baseUrl, 'https://api.datagran.com');
  assert.equal(config.defaults.maxTokens, 256);
  assert.equal(config.http.timeoutMs, 5000);
});

test('resolvePluginConfig normalizes /intelligence URL to API origin', () => {
  const config = resolvePluginConfig({
    baseUrl: 'https://www.datagran.io/intelligence',
    apiKey: 'sk_live_abcdef',
  });

  assert.equal(config.baseUrl, 'https://www.datagran.io');
});

test('schemas accept snake_case aliases', () => {
  const connect = parseConnectInput({
    end_user_external_id: 'external_1',
  });
  assert.equal(connect.endUserExternalId, 'external_1');

  const ingest = parseIngestInput({
    connection_id: '11111111-1111-4111-8111-111111111111',
    name: 'Alias Test',
    text: 'x'.repeat(120),
  });
  assert.equal(ingest.connectionId, '11111111-1111-4111-8111-111111111111');

  const query = parseQueryInput({
    question: 'What happened?',
    end_user_external_id: 'external_1',
    mind_state: 'auto',
    max_tokens: 321,
  });
  assert.equal(query.endUserExternalId, 'external_1');
  assert.equal(query.mindState, 'auto');
  assert.equal(query.maxTokens, 321);
});

test('createMemoryConnection sends x-api-key and expected body', async () => {
  const config = resolvePluginConfig({
    baseUrl: 'https://api.datagran.com',
    apiKey: 'sk_live_abc123',
  });
  const client = new DatagranClient(config);

  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  await withMockFetch(async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return jsonResponse({
      success: true,
      connection_id: 'conn_1',
      end_user_id: 'user_1',
      created: true,
    });
  }, async () => {
    const result = await client.createMemoryConnection({
      endUserExternalId: 'external_1',
      email: 'dev@datagran.com',
    });
    assert.equal(result.connection_id, 'conn_1');
  });

  assert.equal(capturedUrl, 'https://api.datagran.com/api/connections/memory');
  assert.equal(capturedInit?.method, 'POST');
  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get('x-api-key'), 'sk_live_abc123');

  const payload = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
  const endUser = payload.end_user as Record<string, unknown>;
  assert.equal(endUser.external_id, 'external_1');
  assert.equal(endUser.email, 'dev@datagran.com');
});

test('ingestText maps snake_case fields for Datagran API', async () => {
  const config = resolvePluginConfig({
    baseUrl: 'https://api.datagran.com',
    apiKey: 'sk_live_ingest',
  });
  const client = new DatagranClient(config);

  let capturedBody: Record<string, unknown> = {};

  await withMockFetch(async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return jsonResponse({ success: true, stored_as: 'brain', trace_id: 'trace_1' });
  }, async () => {
    await client.ingestText({
      connectionId: '11111111-1111-4111-8111-111111111111',
      name: 'KB',
      text: 'x'.repeat(120),
      type: 'raw_text',
      ref: 'doc-1',
      metadata: { source: 'test' },
    });
  });

  assert.equal(capturedBody.connection_id, '11111111-1111-4111-8111-111111111111');
  assert.equal(capturedBody.name, 'KB');
  assert.equal(capturedBody.type, 'raw_text');
  assert.equal(capturedBody.ref, 'doc-1');
});

test('queryBrain maps snake_case fields and returns payload', async () => {
  const config = resolvePluginConfig({
    baseUrl: 'https://api.datagran.com',
    apiKey: 'sk_live_query',
  });
  const client = new DatagranClient(config);

  let capturedBody: Record<string, unknown> = {};

  await withMockFetch(async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return jsonResponse({ success: true, mode: 'short_term', answer: 'ok' });
  }, async () => {
    const result = await client.queryBrain({
      question: 'What do you know?',
      endUserExternalId: 'external_2',
      mindState: 'auto',
      maxTokens: 300,
      temperature: 0.2,
      include: { citations: true },
    });

    assert.equal(result.success, true);
    assert.equal(result.answer, 'ok');
  });

  assert.equal(capturedBody.end_user_external_id, 'external_2');
  assert.equal(capturedBody.mind_state, 'auto');
  assert.equal(capturedBody.max_tokens, 300);
  assert.equal(capturedBody.temperature, 0.2);
});

test('queryBrain throws DatagranApiError on non-retryable 404', async () => {
  const config = resolvePluginConfig({
    baseUrl: 'https://api.datagran.com',
    apiKey: 'sk_live_error',
    http: { timeoutMs: 1000, retries: 0 },
  });
  const client = new DatagranClient(config);

  await withMockFetch(
    async () =>
      jsonResponse(
        {
          success: false,
          error: 'No brain found for this end user yet.',
        },
        404
      ),
    async () => {
      await assert.rejects(
        () =>
          client.queryBrain({
            question: 'test',
            endUserExternalId: 'external_3',
          }),
        (error: unknown) => {
          assert.ok(error instanceof DatagranApiError);
          assert.equal(error.status, 404);
          return true;
        }
      );
    }
  );
});
