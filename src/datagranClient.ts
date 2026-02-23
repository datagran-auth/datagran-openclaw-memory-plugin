import type { ConnectInput, IngestInput, PluginConfig, QueryInput } from './schemas';

type HttpMethod = 'POST';

type RequestOptions = {
  method: HttpMethod;
  path: string;
  body: Record<string, unknown>;
};

export type DatagranConnectResponse = {
  success?: boolean;
  connection_id?: string;
  end_user_id?: string;
  end_user_external_id?: string;
  provider?: string;
  created?: boolean;
  message?: string;
  [key: string]: unknown;
};

export type DatagranIngestResponse = {
  success?: boolean;
  stored_as?: string;
  message?: string;
  trace_id?: string;
  [key: string]: unknown;
};

export type DatagranQueryResponse = {
  success?: boolean;
  mode?: string;
  answer?: string;
  suggested_action?: string;
  error?: string;
  [key: string]: unknown;
};

export class DatagranApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly retryable: boolean;

  constructor(message: string, status: number, body: unknown, retryable: boolean) {
    super(message);
    this.name = 'DatagranApiError';
    this.status = status;
    this.body = body;
    this.retryable = retryable;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function extractErrorMessage(body: unknown, fallback: string): string {
  const record = asRecord(body);
  const fromError = asNonEmptyString(record.error);
  if (fromError) return fromError;
  const fromMessage = asNonEmptyString(record.message);
  if (fromMessage) return fromMessage;
  if (typeof body === 'string' && body.trim().length > 0) return body.trim();
  return fallback;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function backoffMs(attempt: number): number {
  return Math.min(2000, 250 * 2 ** attempt);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DatagranClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(config: PluginConfig) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.timeoutMs = config.http.timeoutMs;
    this.retries = config.http.retries;
  }

  async createMemoryConnection(input: ConnectInput): Promise<DatagranConnectResponse> {
    const body: Record<string, unknown> = {
      end_user: {
        external_id: input.endUserExternalId,
        ...(input.email ? { email: input.email } : {}),
      },
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };

    return this.request<DatagranConnectResponse>({
      method: 'POST',
      path: '/api/connections/memory',
      body,
    });
  }

  async ingestText(input: IngestInput): Promise<DatagranIngestResponse> {
    const body: Record<string, unknown> = {
      name: input.name,
      text: input.text,
      type: input.type,
      ...(input.connectionId ? { connection_id: input.connectionId } : {}),
      ...(input.endUserExternalId ? { end_user_external_id: input.endUserExternalId } : {}),
      ...(input.ref ? { ref: input.ref } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };

    return this.request<DatagranIngestResponse>({
      method: 'POST',
      path: '/api/context/compile',
      body,
    });
  }

  async queryBrain(input: QueryInput): Promise<DatagranQueryResponse> {
    const body: Record<string, unknown> = {
      question: input.question,
      ...(input.connectionId ? { connection_id: input.connectionId } : {}),
      ...(input.endUserExternalId ? { end_user_external_id: input.endUserExternalId } : {}),
      ...(input.mindState ? { mind_state: input.mindState } : {}),
      ...(input.providers ? { providers: input.providers } : {}),
      ...(input.include ? { include: input.include } : {}),
      ...(typeof input.maxTokens === 'number' ? { max_tokens: input.maxTokens } : {}),
      ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
    };

    return this.request<DatagranQueryResponse>({
      method: 'POST',
      path: '/api/context/brain',
      body,
    });
  }

  private async request<T>(opts: RequestOptions): Promise<T> {
    let attempt = 0;
    let lastError: unknown = null;

    while (attempt <= this.retries) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(`${this.baseUrl}${opts.path}`, {
          method: opts.method,
          headers: {
            'content-type': 'application/json',
            'x-api-key': this.apiKey,
          },
          body: JSON.stringify(opts.body),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const payload = await this.parseResponseBody(response);

        if (response.ok) {
          return payload as T;
        }

        const retryable = isRetryableStatus(response.status);
        const message = extractErrorMessage(payload, `Datagran request failed with HTTP ${response.status}`);
        const apiError = new DatagranApiError(message, response.status, payload, retryable);

        if (!retryable || attempt >= this.retries) {
          throw apiError;
        }

        lastError = apiError;
      } catch (error) {
        clearTimeout(timeout);

        if (error instanceof DatagranApiError) {
          throw error;
        }

        const retryable = isAbortError(error) || error instanceof TypeError;
        if (!retryable || attempt >= this.retries) {
          throw error;
        }
        lastError = error;
      }

      await sleep(backoffMs(attempt));
      attempt += 1;
    }

    throw lastError instanceof Error ? lastError : new Error('Datagran request failed after retries');
  }

  private async parseResponseBody(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
}
