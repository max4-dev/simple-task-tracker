import { jest } from '@jest/globals';
import {
  BadRequestException,
  Logger,
  type ArgumentsHost,
} from '@nestjs/common';
import { ApiExceptionFilter } from './exception.filter.js';

describe('HTTP error boundary', () => {
  const json = jest.fn();
  const response = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnValue({ json }),
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ requestId: 'request-123' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  beforeEach(() => jest.clearAllMocks());

  it('preserves validation messages and adds a stable code and request identifier', () => {
    new ApiExceptionFilter().catch(
      new BadRequestException(['name is required']),
      host,
    );
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      code: 'INVALID_REQUEST',
      message: ['name is required'],
      requestId: 'request-123',
    });
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store',
    );
  });

  it('never exposes driver secrets in responses or structured error logs', () => {
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      new ApiExceptionFilter().catch(
        new Error('postgresql://private:private-password@host/db'),
        host,
      );
      expect(json).toHaveBeenCalledWith({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: 'Внутренняя ошибка сервера',
        requestId: 'request-123',
      });
      expect(log).toHaveBeenCalledWith(
        JSON.stringify({
          requestId: 'request-123',
          statusCode: 500,
          code: 'INTERNAL_ERROR',
        }),
      );
    } finally {
      log.mockRestore();
    }
  });
});
