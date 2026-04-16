import { ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';

describe('CacheService', () => {
  it('getOrSet runs loader when Redis is inactive', async () => {
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
    } as any;
    const svc = new CacheService(config, logger);
    await svc.onModuleInit();
    const loader = jest.fn().mockResolvedValue({ a: 1 });
    const out = await svc.getOrSet('k', 60, loader, JSON.stringify, (raw) => JSON.parse(raw));
    expect(out).toEqual({ a: 1 });
    expect(loader).toHaveBeenCalledTimes(1);
    await svc.onModuleDestroy();
  });
});
