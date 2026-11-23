import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { RedisModule } from '../../common/redis/redis.module.js';
import { RedisService } from '../../common/redis/redis.service.js';
import { RedisThrottlerStorage } from '../../common/redis/throttler.storage.js';
import { TIME } from '../../common/constants/index.js';
import { JwtModule } from '@nestjs/jwt';
import { getJwtConfig } from '../../common/config/jwt.config.js';
import { DatabaseModule } from '../../common/database/database.module.js';
import { TokenModule } from '../../common/redis/token.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { TokenCookieService } from './services/token-cookie.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

@Module({
  imports: [
    ConfigModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        throttlers: [{ ttl: TIME.ONE_MINUTE.IN_MS, limit: 10 }],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
    DatabaseModule,
    TokenModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getJwtConfig,
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, TokenCookieService],
  exports: [TokenCookieService, ThrottlerModule],
})
export class AuthModule {}
