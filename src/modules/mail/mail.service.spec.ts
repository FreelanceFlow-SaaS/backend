import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import { mockLoggerProvider } from '../../common/testing/mock-logger';

describe('MailService', () => {
  let service: MailService;
  let config: jest.Mocked<Pick<ConfigService, 'get'>>;

  beforeEach(async () => {
    config = { get: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: ConfigService, useValue: config },
        mockLoggerProvider(MailService.name),
      ],
    }).compile();
    service = module.get(MailService);
  });

  it('isConfigured returns false when SMTP_HOST is empty', () => {
    config.get.mockImplementation((key: string) => (key === 'SMTP_HOST' ? '' : undefined));
    expect(service.isConfigured()).toBe(false);
  });

  it('isConfigured returns true when SMTP_HOST is set', () => {
    config.get.mockImplementation((key: string) =>
      key === 'SMTP_HOST' ? 'smtp.example.com' : undefined
    );
    expect(service.isConfigured()).toBe(true);
  });
});
