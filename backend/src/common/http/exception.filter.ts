import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

const codes: Record<number, string> = {
  400: 'INVALID_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<Request & { requestId: string }>();
    const res = http.getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const body =
      exception instanceof HttpException ? exception.getResponse() : null;
    const details =
      body && typeof body === 'object'
        ? (body as { message?: string | string[]; code?: string })
        : {};
    const code = details.code ?? codes[status] ?? 'INTERNAL_ERROR';
    if (status >= 500)
      this.logger.error(
        JSON.stringify({ requestId: req.requestId, statusCode: status, code }),
      );
    res.setHeader('Cache-Control', 'no-store');
    res.status(status).json({
      statusCode: status,
      code,
      message:
        typeof body === 'string'
          ? body
          : (details.message ?? 'Внутренняя ошибка сервера'),
      requestId: req.requestId,
    });
  }
}
