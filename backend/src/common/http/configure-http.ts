import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { ApiExceptionFilter } from './exception.filter.js';

export function configureHttp(app: INestApplication) {
  const config = app.get(ConfigService);
  const trustedProxies = config.getOrThrow<string[]>('TRUSTED_PROXY_CIDRS');
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', trustedProxies.length ? trustedProxies : false);
  app.use(
    (
      req: Request & { requestId?: string },
      res: Response,
      next: NextFunction,
    ) => {
      req.requestId = randomUUID();
      res.setHeader('X-Request-Id', req.requestId);
      next();
    },
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: { target: false, value: false },
    }),
  );
  app.enableCors({
    origin: app.get(ConfigService).getOrThrow<string[]>('TRUSTED_ORIGINS'),
    credentials: true,
  });
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Task tracker API')
      .setVersion('1.0')
      .addCookieAuth(
        'accessToken',
        { type: 'apiKey', in: 'cookie' },
        'accessToken',
      )
      .build(),
  );
  SwaggerModule.setup('docs', app, document);
}
