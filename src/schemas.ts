import { z } from 'zod';

const MIND_STATES = ['auto', 'short_term', 'mid_term', 'long_term'] as const;

const SOURCE_TYPES = [
  'raw_text',
  'google_drive',
  'notion',
  'url',
  'facebook_ads',
  'facebook_leads',
  'google_ads',
  'instagram',
  'linkedin_ads',
  'tiktok_ads',
  'salesforce',
  'hubspot',
  'postgres_query',
  'api_response',
  'firecrawl',
] as const;

const QueryIncludeSchema = z
  .object({
    evidence: z.boolean().optional(),
    precision: z.boolean().optional(),
    citations: z.boolean().optional(),
    reconcile: z.boolean().optional(),
  })
  .strict();

const ConnectInputSchema = z.object({
  endUserExternalId: z.string().min(1),
  email: z.string().email().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const IngestInputSchema = z
  .object({
    connectionId: z.string().uuid().optional(),
    endUserExternalId: z.string().min(1).optional(),
    email: z.string().email().optional(),
    name: z.string().min(1).max(255),
    text: z.string().min(100).max(10_000_000),
    type: z.enum(SOURCE_TYPES).default('raw_text'),
    ref: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .refine((v) => Boolean(v.connectionId || v.endUserExternalId), {
    message: 'Provide connectionId or endUserExternalId',
  });

const QueryInputSchema = z
  .object({
    question: z.string().min(1).max(100_000),
    connectionId: z.string().uuid().optional(),
    endUserExternalId: z.string().min(1).optional(),
    mindState: z.enum(MIND_STATES).optional(),
    providers: z.array(z.string().min(1)).optional(),
    include: QueryIncludeSchema.optional(),
    maxTokens: z.number().int().min(1).max(4096).optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .refine((v) => Boolean(v.connectionId || v.endUserExternalId), {
    message: 'Provide connectionId or endUserExternalId',
  });

const PluginConfigSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  allowHttp: z.boolean().default(false),
  defaults: z
    .object({
      mindState: z.enum(MIND_STATES).default('auto'),
      maxTokens: z.number().int().min(1).max(4096).default(512),
      temperature: z.number().min(0).max(2).default(0.2),
    })
    .default({}),
  http: z
    .object({
      timeoutMs: z.number().int().min(1000).max(120_000).default(30_000),
      retries: z.number().int().min(0).max(5).default(2),
    })
    .default({}),
});

export type MindState = (typeof MIND_STATES)[number];
export type SourceType = (typeof SOURCE_TYPES)[number];
export type ConnectInput = z.infer<typeof ConnectInputSchema>;
export type IngestInput = z.infer<typeof IngestInputSchema>;
export type QueryInput = z.infer<typeof QueryInputSchema>;
export type QueryInclude = z.infer<typeof QueryIncludeSchema>;
export type PluginConfig = z.infer<typeof PluginConfigSchema>;

export const connectToolParameters: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['endUserExternalId'],
  properties: {
    endUserExternalId: { type: 'string', description: 'Your external end-user identifier.' },
    email: { type: 'string', format: 'email' },
    metadata: { type: 'object', additionalProperties: true },
  },
};

export const ingestToolParameters: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'text'],
  properties: {
    connectionId: {
      type: 'string',
      format: 'uuid',
      description: 'Datagran connection id. If missing, endUserExternalId is required for auto-connect.',
    },
    endUserExternalId: { type: 'string' },
    email: { type: 'string', format: 'email' },
    name: { type: 'string', minLength: 1, maxLength: 255 },
    text: { type: 'string', minLength: 100, maxLength: 10000000 },
    type: { type: 'string', enum: [...SOURCE_TYPES] },
    ref: { type: 'string' },
    metadata: { type: 'object', additionalProperties: true },
  },
  anyOf: [{ required: ['connectionId'] }, { required: ['endUserExternalId'] }],
};

export const queryToolParameters: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['question'],
  properties: {
    question: { type: 'string', minLength: 1, maxLength: 100000 },
    connectionId: { type: 'string', format: 'uuid' },
    endUserExternalId: { type: 'string' },
    mindState: { type: 'string', enum: [...MIND_STATES] },
    providers: { type: 'array', items: { type: 'string' } },
    include: {
      type: 'object',
      additionalProperties: false,
      properties: {
        evidence: { type: 'boolean' },
        precision: { type: 'boolean' },
        citations: { type: 'boolean' },
        reconcile: { type: 'boolean' },
      },
    },
    maxTokens: { type: 'integer', minimum: 1, maximum: 4096 },
    temperature: { type: 'number', minimum: 0, maximum: 2 },
  },
  anyOf: [{ required: ['connectionId'] }, { required: ['endUserExternalId'] }],
};

export const pluginConfigJsonSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['baseUrl', 'apiKey'],
  properties: {
    baseUrl: {
      type: 'string',
      format: 'uri',
      description: 'Datagran API base URL (for example https://www.datagran.io).',
    },
    apiKey: {
      type: 'string',
      minLength: 1,
      description: 'Datagran partner API key (sk_live_...).',
    },
    allowHttp: {
      type: 'boolean',
      default: false,
      description: 'Allow non-HTTPS baseUrl (use only for local development).',
    },
    defaults: {
      type: 'object',
      additionalProperties: false,
      properties: {
        mindState: { type: 'string', enum: [...MIND_STATES], default: 'auto' },
        maxTokens: { type: 'integer', minimum: 1, maximum: 4096, default: 512 },
        temperature: { type: 'number', minimum: 0, maximum: 2, default: 0.2 },
      },
    },
    http: {
      type: 'object',
      additionalProperties: false,
      properties: {
        timeoutMs: { type: 'integer', minimum: 1000, maximum: 120000, default: 30000 },
        retries: { type: 'integer', minimum: 0, maximum: 5, default: 2 },
      },
    },
  },
};

export const pluginUiHints: Record<string, unknown> = {
  baseUrl: { label: 'Datagran Base URL', placeholder: 'https://www.datagran.io' },
  apiKey: { label: 'Datagran API Key', placeholder: 'sk_live_...', sensitive: true },
  allowHttp: { label: 'Allow HTTP (local only)' },
  'defaults.mindState': { label: 'Default Mind State' },
  'defaults.maxTokens': { label: 'Default Max Tokens' },
  'defaults.temperature': { label: 'Default Temperature' },
  'http.timeoutMs': { label: 'HTTP Timeout (ms)' },
  'http.retries': { label: 'HTTP Retries' },
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function readNestedRecord(root: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  let current: unknown = root;
  for (const key of keys) {
    const record = asRecord(current);
    current = record[key];
  }
  return asRecord(current);
}

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}

function normalizeDatagranBaseUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  const path = parsed.pathname.replace(/\/+$/, '');

  // Users may paste the product landing page URL.
  // The API lives on the same origin under /api/*.
  if (path === '' || path === '/' || path === '/intelligence') {
    return parsed.origin;
  }

  return `${parsed.origin}${path}`;
}

function extractScopedConfig(rawConfig: unknown, pluginId: string): Record<string, unknown> {
  const root = asRecord(rawConfig);

  if (typeof root.baseUrl === 'string' || typeof root.apiKey === 'string') {
    return root;
  }

  const fromPluginConfig = asRecord(root.pluginConfig);
  if (typeof fromPluginConfig.baseUrl === 'string' || typeof fromPluginConfig.apiKey === 'string') {
    return fromPluginConfig;
  }

  const fromEntries = readNestedRecord(root, ['plugins', 'entries', pluginId, 'config']);
  if (Object.keys(fromEntries).length > 0) {
    return fromEntries;
  }

  return root;
}

export function parseConnectInput(input: unknown): ConnectInput {
  return ConnectInputSchema.parse(input);
}

export function parseIngestInput(input: unknown): IngestInput {
  return IngestInputSchema.parse(input);
}

export function parseQueryInput(input: unknown): QueryInput {
  return QueryInputSchema.parse(input);
}

export function resolvePluginConfig(rawConfig: unknown, pluginId = 'datagran-memory'): PluginConfig {
  const scopedConfig = extractScopedConfig(rawConfig, pluginId);
  const parsed = PluginConfigSchema.parse(scopedConfig);
  const normalizedBaseUrl = stripTrailingSlashes(normalizeDatagranBaseUrl(parsed.baseUrl));

  if (!parsed.allowHttp && normalizedBaseUrl.startsWith('http://')) {
    throw new Error('Insecure baseUrl blocked. Use HTTPS or set allowHttp=true for local development.');
  }

  return {
    ...parsed,
    baseUrl: normalizedBaseUrl,
  };
}
