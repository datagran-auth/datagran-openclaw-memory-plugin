import { ZodError } from 'zod';

import { DatagranApiError, DatagranClient } from './datagranClient';
import {
  connectToolParameters,
  ingestToolParameters,
  parseConnectInput,
  parseIngestInput,
  parseQueryInput,
  queryToolParameters,
  resolvePluginConfig,
} from './schemas';
import type { JsonObject, PluginApi, ToolResult } from './types';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return '***';
  return `${key.slice(0, 5)}...${key.slice(-3)}`;
}

function success(text: string, structuredContent?: JsonObject): ToolResult {
  return {
    content: [{ type: 'text', text }],
    ...(structuredContent ? { structuredContent } : {}),
  };
}

function normalizeError(error: unknown): ToolResult {
  if (error instanceof ZodError) {
    const details = error.errors.map((e) => `${e.path.join('.') || '(input)'}: ${e.message}`).join('; ');
    return success(`Invalid input: ${details}`, {
      success: false,
      error: 'validation_error',
      details,
    });
  }

  if (error instanceof DatagranApiError) {
    const message = `Datagran API error (${error.status}): ${error.message}`;
    return success(message, {
      success: false,
      status: error.status,
      error: error.message,
      body: error.body,
    });
  }

  if (error instanceof Error) {
    return success(`Unexpected error: ${error.message}`, {
      success: false,
      error: error.message,
    });
  }

  return success('Unexpected error: unknown', {
    success: false,
    error: 'unknown_error',
  });
}

function createClient(rawConfig: unknown, pluginId: string): DatagranClient {
  const config = resolvePluginConfig(rawConfig, pluginId);
  return new DatagranClient(config);
}

function buildQueryAnswerText(payload: Record<string, unknown>): string {
  const mode = asString(payload.mode) ?? 'unknown';
  const answer = asString(payload.answer);
  const suggestedAction = asString(payload.suggested_action);
  const successValue = asBoolean(payload.success);

  const lines = [`mode: ${mode}`];

  if (answer) {
    lines.push('', answer);
  } else {
    const shortTerm = asRecord(payload.short_term);
    const rawText = asString(shortTerm.raw_text);
    if (rawText) {
      lines.push('', `No synthesized answer returned. short_term.raw_text length=${rawText.length}.`);
    }
  }

  if (suggestedAction) {
    lines.push('', `suggested_action: ${suggestedAction}`);
  }

  if (successValue === false && !answer) {
    const errorMessage = asString(payload.error);
    if (errorMessage) lines.push('', `error: ${errorMessage}`);
  }

  return lines.join('\n');
}

export function registerDatagranMemoryTools(api: PluginApi, pluginId = 'datagran-memory'): void {
  api.registerTool(
    {
      name: 'datagran_memory_connect',
      description: `Create or reuse a Datagran memory connection for an end user.

Call this ONCE per user before ingesting or querying memory. If the user already has a connection, this returns the existing one (idempotent).

You only need endUserExternalId (your unique identifier for the user). The returned connection_id is used by the other datagran_memory tools.

Typical workflow:
1. datagran_memory_connect (once per user)
2. datagran_memory_ingest (store data)
3. datagran_memory_query (ask questions)`,
      parameters: connectToolParameters,
      async execute(_id, params) {
        try {
          const input = parseConnectInput(params);
          const client = createClient(api.config, pluginId);
          const result = await client.createMemoryConnection(input);

          const connectionId = asString(result.connection_id) ?? '(missing)';
          const endUserId = asString(result.end_user_id) ?? '(missing)';
          const created = asBoolean(result.created);
          const message = asString(result.message) ?? 'Memory connection upserted.';

          const text = [
            `connection_id: ${connectionId}`,
            `end_user_id: ${endUserId}`,
            `created: ${created === null ? 'unknown' : String(created)}`,
            '',
            message,
          ].join('\n');

          return success(text, result);
        } catch (error) {
          return normalizeError(error);
        }
      },
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: 'datagran_memory_ingest',
      description: `Store relevant new information into a user's Datagran memory so it can be queried in future conversations.

Only use this when the data is genuinely useful long-term — reports, key metrics, documents, decisions, new facts the user shared, etc. Do NOT store trivial messages, duplicates, data already in memory, or temporary results.

Before ingesting, ask yourself: "Would this be useful if the user comes back tomorrow?" If not, skip it.

If you provide endUserExternalId instead of connectionId, the plugin auto-creates a memory connection first.

Large documents (>500k tokens) are automatically routed to long-term RAG storage. Small documents go into short-term memory. This is handled automatically.

After ingesting, call datagran_memory_query to ask questions about the stored content.`,
      parameters: ingestToolParameters,
      async execute(_id, params) {
        try {
          const input = parseIngestInput(params);
          const client = createClient(api.config, pluginId);

          let connectionId = input.connectionId;
          let autoConnected = false;

          if (!connectionId && input.endUserExternalId) {
            const connection = await client.createMemoryConnection({
              endUserExternalId: input.endUserExternalId,
              email: input.email,
            });
            connectionId = asString(connection.connection_id) ?? undefined;
            autoConnected = Boolean(connectionId);
          }

          const compileResult = await client.ingestText({
            ...input,
            connectionId,
          });

          const storedAs = asString(compileResult.stored_as) ?? 'unknown';
          const traceId = asString(compileResult.trace_id) ?? '(none)';
          const message = asString(compileResult.message) ?? 'Ingest request accepted.';

          const text = [
            `stored_as: ${storedAs}`,
            `trace_id: ${traceId}`,
            `connection_id: ${connectionId ?? '(none)'}`,
            `auto_connected: ${autoConnected}`,
            '',
            message,
          ].join('\n');

          return success(text, {
            ...compileResult,
            connection_id: connectionId ?? null,
            auto_connected: autoConnected,
          });
        } catch (error) {
          return normalizeError(error);
        }
      },
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: 'datagran_memory_query',
      description: `ALWAYS TRY THIS FIRST before fetching new data or asking the user for information they may have provided before.

This queries a user's Datagran brain — a unified memory that contains all previously stored data for that user. It searches both recent memory (short-term) and historical archives (long-term RAG) automatically.

Critical workflow:
1. Call datagran_memory_query FIRST with the user's question
2. If an answer exists → use it, you're done
3. If "no brain found" → the user has no stored data yet. Use datagran_memory_ingest to store data first, then query again.

The response includes:
- answer: synthesized answer from memory (if inference is configured)
- short_term.raw_text: recent raw memory entries
- long_term: relevant historical snippets with relevance scores
- freshness: timestamps showing how recent the data is

Use mindState="auto" (default) to let Datagran pick the best retrieval strategy.`,
      parameters: queryToolParameters,
      async execute(_id, params) {
        try {
          const input = parseQueryInput(params);
          const config = resolvePluginConfig(api.config, pluginId);
          const client = new DatagranClient(config);

          const response = await client.queryBrain({
            ...input,
            mindState: input.mindState ?? config.defaults.mindState,
            maxTokens: input.maxTokens ?? config.defaults.maxTokens,
            temperature: input.temperature ?? config.defaults.temperature,
          });

          const text = buildQueryAnswerText(response);
          return success(text, response);
        } catch (error) {
          return normalizeError(error);
        }
      },
    },
    { optional: true }
  );

  if (api.registerCommand) {
    api.registerCommand({
      name: 'dg-memory-status',
      description: 'Show Datagran memory plugin config status.',
      requireAuth: false,
      handler: (ctx) => {
        try {
          const config = resolvePluginConfig(ctx.config ?? api.config, pluginId);
          return {
            text: [
              `Plugin: ${pluginId}`,
              `Base URL: ${config.baseUrl}`,
              `API key: ${maskApiKey(config.apiKey)}`,
              `Defaults: mindState=${config.defaults.mindState}, maxTokens=${config.defaults.maxTokens}, temperature=${config.defaults.temperature}`,
              `HTTP: timeoutMs=${config.http.timeoutMs}, retries=${config.http.retries}`,
            ].join('\n'),
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown error';
          return { text: `Config error: ${message}` };
        }
      },
    });
  }

  api.logger?.info?.(`[${pluginId}] Registered Datagran memory tools`);
}
