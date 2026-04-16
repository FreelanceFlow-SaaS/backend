import { Client } from '@elastic/elasticsearch';
import { Writable } from 'stream';

const BATCH_MAX_DOCS = 128;
const FLUSH_MS = 2_000;

export type ElasticsearchPinoStreamConfig = {
  node: string;
  index: string;
  auth: { apiKey: string } | { username: string; password: string };
};

function trimSecret(value: string | undefined): string {
  if (!value) return '';
  let s = value.trim().replace(/^\uFEFF/, '');
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/**
 * When `ELASTICSEARCH_URL` and either `ELASTICSEARCH_API_KEY` or
 * (`ELASTICSEARCH_USERNAME` + `ELASTICSEARCH_PASSWORD`) are set, returns config.
 * Otherwise `null` (no Elasticsearch shipping).
 */
export function parseElasticsearchEnv(): ElasticsearchPinoStreamConfig | null {
  const node = trimSecret(process.env.ELASTICSEARCH_URL);
  if (!node) return null;

  const apiKey = trimSecret(process.env.ELASTICSEARCH_API_KEY);
  const username = trimSecret(process.env.ELASTICSEARCH_USERNAME);
  const password = trimSecret(process.env.ELASTICSEARCH_PASSWORD);

  let auth: ElasticsearchPinoStreamConfig['auth'] | null = null;
  if (apiKey) {
    auth = { apiKey };
  } else if (username && password) {
    auth = { username, password };
  } else {
    return null;
  }

  const index = trimSecret(process.env.ELASTICSEARCH_LOG_INDEX) || 'freelanceflow-api-logs';

  return { node, index, auth };
}

function createClient(config: ElasticsearchPinoStreamConfig): Client {
  return new Client({
    node: config.node,
    auth: config.auth,
    requestTimeout: 30_000,
    maxRetries: 2,
  });
}

/**
 * Writable stream: newline-delimited JSON from Pino, batched `bulk` to Elasticsearch.
 * Do not log with Pino from inside this stream (avoid recursion).
 */
export class ElasticsearchPinoStream extends Writable {
  private readonly client: Client;
  private readonly index: string;
  private lineBuffer = '';
  private readonly batch: Record<string, unknown>[] = [];
  private flushTimer: ReturnType<typeof setInterval> | undefined;
  private flushInFlight: Promise<void> = Promise.resolve();
  private warned = false;

  constructor(config: ElasticsearchPinoStreamConfig) {
    super();
    this.client = createClient(config);
    this.index = config.index;
    this.flushTimer = setInterval(() => {
      void this.flushSafe();
    }, FLUSH_MS);
    this.flushTimer.unref?.();
  }

  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    this.lineBuffer += chunk.toString('utf8');
    const parts = this.lineBuffer.split('\n');
    this.lineBuffer = parts.pop() ?? '';
    for (const line of parts) {
      if (line.length === 0) continue;
      try {
        const doc = JSON.parse(line) as Record<string, unknown>;
        this.batch.push(doc);
      } catch {
        // skip malformed line
      }
      if (this.batch.length >= BATCH_MAX_DOCS) {
        void this.flushSafe();
      }
    }
    callback();
  }

  override _final(callback: (error?: Error | null) => void): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (this.lineBuffer.trim().length > 0) {
      try {
        this.batch.push(JSON.parse(this.lineBuffer) as Record<string, unknown>);
      } catch {
        // ignore trailing garbage
      }
      this.lineBuffer = '';
    }
    void this.flushSafe().then(
      () => callback(),
      () => callback()
    );
  }

  override _destroy(err: Error | null, callback: (error?: Error | null) => void): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    void this.flushSafe()
      .then(() => this.client.close().catch(() => undefined))
      .then(
        () => callback(err ?? undefined),
        () => callback(err ?? undefined)
      );
  }

  /** Test hook: wait until pending bulk completes. */
  flushForTests(): Promise<void> {
    return this.flushSafe();
  }

  private flushSafe(): Promise<void> {
    this.flushInFlight = this.flushInFlight.then(() => this.flush());
    return this.flushInFlight;
  }

  private async flush(): Promise<void> {
    if (this.batch.length === 0) return;
    const docs = this.batch.splice(0, this.batch.length);
    const operations: object[] = [];
    for (const doc of docs) {
      operations.push({ index: { _index: this.index } });
      operations.push(doc);
    }

    try {
      const res = await this.client.bulk({ operations });
      if (res.errors) {
        const first = res.items?.find((i) => {
          const op = i.index ?? i.create;
          return op?.error;
        });
        const errMsg = first?.index?.error?.reason ?? first?.create?.error?.reason ?? 'bulk errors';
        this.warnOnce(`Elasticsearch bulk reported errors: ${String(errMsg).slice(0, 240)}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.warnOnce(`Elasticsearch bulk failed: ${msg.slice(0, 240)}`);
    }
  }

  private warnOnce(message: string): void {
    if (this.warned) return;
    this.warned = true;
    process.stderr.write(`[freelanceflow-api] ${message}\n`);
  }
}

export function createElasticsearchPinoStream(
  config: ElasticsearchPinoStreamConfig
): ElasticsearchPinoStream {
  return new ElasticsearchPinoStream(config);
}
