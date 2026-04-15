import { Client } from '@elastic/elasticsearch';
import { ElasticsearchPinoStream, parseElasticsearchEnv } from './elasticsearch-pino.stream';

describe('parseElasticsearchEnv', () => {
  const envKeys = [
    'ELASTICSEARCH_URL',
    'ELASTICSEARCH_API_KEY',
    'ELASTICSEARCH_USERNAME',
    'ELASTICSEARCH_PASSWORD',
    'ELASTICSEARCH_LOG_INDEX',
  ] as const;
  const snapshot: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const k of envKeys) {
      snapshot[k] = process.env[k];
    }
  });

  afterEach(() => {
    for (const k of envKeys) {
      const v = snapshot[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('returns null when URL missing', () => {
    delete process.env.ELASTICSEARCH_URL;
    process.env.ELASTICSEARCH_API_KEY = 'k';
    expect(parseElasticsearchEnv()).toBeNull();
  });

  it('returns null when no auth', () => {
    process.env.ELASTICSEARCH_URL = 'https://es.example:9243';
    delete process.env.ELASTICSEARCH_API_KEY;
    delete process.env.ELASTICSEARCH_USERNAME;
    delete process.env.ELASTICSEARCH_PASSWORD;
    expect(parseElasticsearchEnv()).toBeNull();
  });

  it('returns null when only username (no password)', () => {
    process.env.ELASTICSEARCH_URL = 'https://es.example:9243';
    delete process.env.ELASTICSEARCH_API_KEY;
    process.env.ELASTICSEARCH_USERNAME = 'elastic';
    delete process.env.ELASTICSEARCH_PASSWORD;
    expect(parseElasticsearchEnv()).toBeNull();
  });

  it('returns config with API key', () => {
    process.env.ELASTICSEARCH_URL = 'https://my.es.cloud:443';
    process.env.ELASTICSEARCH_API_KEY = 'base64key';
    delete process.env.ELASTICSEARCH_LOG_INDEX;
    const c = parseElasticsearchEnv();
    expect(c).toEqual({
      node: 'https://my.es.cloud:443',
      index: 'freelanceflow-api-logs',
      auth: { apiKey: 'base64key' },
    });
  });

  it('returns config with basic auth and custom index', () => {
    process.env.ELASTICSEARCH_URL = 'https://es.local';
    delete process.env.ELASTICSEARCH_API_KEY;
    process.env.ELASTICSEARCH_USERNAME = 'elastic';
    process.env.ELASTICSEARCH_PASSWORD = 'changeme';
    process.env.ELASTICSEARCH_LOG_INDEX = 'custom-logs';
    const c = parseElasticsearchEnv();
    expect(c).toEqual({
      node: 'https://es.local',
      index: 'custom-logs',
      auth: { username: 'elastic', password: 'changeme' },
    });
  });
});

describe('ElasticsearchPinoStream', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('batches NDJSON lines into bulk', async () => {
    const bulk = jest.fn().mockResolvedValue({ errors: false, items: [] });
    const close = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(Client.prototype, 'bulk').mockImplementation(bulk as never);
    jest.spyOn(Client.prototype, 'close').mockImplementation(close as never);

    const stream = new ElasticsearchPinoStream({
      node: 'https://example',
      index: 'ix',
      auth: { apiKey: 'k' },
    });

    await new Promise<void>((resolve, reject) => {
      stream.write('{"message":"a","log.level":"info"}\n', 'utf8', (e) =>
        e ? reject(e) : resolve()
      );
    });
    await new Promise<void>((resolve, reject) => {
      stream.write('{"message":"b","log.level":"info"}\n', 'utf8', (e) =>
        e ? reject(e) : resolve()
      );
    });
    await stream.flushForTests();

    expect(bulk).toHaveBeenCalledWith({
      operations: [
        { index: { _index: 'ix' } },
        { message: 'a', 'log.level': 'info' },
        { index: { _index: 'ix' } },
        { message: 'b', 'log.level': 'info' },
      ],
    });

    await new Promise<void>((resolve) => {
      stream.once('close', () => resolve());
      stream.destroy();
    });
    expect(close).toHaveBeenCalled();
  });
});
