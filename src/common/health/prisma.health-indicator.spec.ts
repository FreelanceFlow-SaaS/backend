import { HealthCheckError } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health-indicator';

const mockPrisma = {
  $queryRaw: jest.fn(),
};

describe('PrismaHealthIndicator', () => {
  let indicator: PrismaHealthIndicator;

  beforeEach(() => {
    jest.clearAllMocks();
    indicator = new PrismaHealthIndicator(mockPrisma as any);
  });

  it('should return healthy status when DB responds to SELECT 1', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const result = await indicator.isHealthy('database');

    expect(result.database.status).toBe('up');
  });

  it('should throw HealthCheckError when DB is unreachable', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('Connection refused'));

    await expect(indicator.isHealthy('database')).rejects.toThrow(HealthCheckError);
  });

  it('should include the error message in the HealthCheckError cause', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('ECONNREFUSED'));

    try {
      await indicator.isHealthy('database');
    } catch (err) {
      expect(err).toBeInstanceOf(HealthCheckError);
      const cause = (err as HealthCheckError).causes;
      expect(JSON.stringify(cause)).toContain('down');
    }
  });
});
