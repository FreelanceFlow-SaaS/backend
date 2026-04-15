import { RequestIdMiddleware } from './request-id.middleware';
import { Request, Response } from 'express';

const mockRes = () => {
  const headers: Record<string, string> = {};
  return {
    setHeader: jest.fn((key: string, value: string) => {
      headers[key] = value;
    }),
    _headers: headers,
  } as unknown as Response;
};

const mockReq = (id?: string) => ({ id }) as unknown as Request;

describe('RequestIdMiddleware', () => {
  let middleware: RequestIdMiddleware;

  beforeEach(() => {
    middleware = new RequestIdMiddleware();
  });

  it('should set X-Request-Id header when req.id is present', () => {
    const req = mockReq('test-uuid-1234');
    const res = mockRes();
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'test-uuid-1234');
    expect(next).toHaveBeenCalled();
  });

  it('should not set X-Request-Id header when req.id is absent', () => {
    const req = mockReq(undefined);
    const res = mockRes();
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(res.setHeader).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should always call next()', () => {
    const req = mockReq('any-id');
    const res = mockRes();
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
