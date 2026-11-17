import 'reflect-metadata';
import { configureHttp } from './common/http/configure-http.js';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { ConfigSchema } from './common/config/app-config/index.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  configureHttp(app);
  const config = app.get(ConfigService<ConfigSchema, true>);
  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0');
}
bootstrap().catch(() => {
  // Detailed driver errors may contain credentials; do not log them here.
  Logger.error('Application startup failed', 'Bootstrap');
  process.exit(1);
});
