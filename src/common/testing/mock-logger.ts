import { getLoggerToken } from 'nestjs-pino';

export const mockLoggerValue = {
  trace: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
  assign: jest.fn(),
};

export function mockLoggerProvider(context: string) {
  return { provide: getLoggerToken(context), useValue: mockLoggerValue };
}
