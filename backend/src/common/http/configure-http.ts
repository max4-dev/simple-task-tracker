import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

export function configureHttp(app: INestApplication) {
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
