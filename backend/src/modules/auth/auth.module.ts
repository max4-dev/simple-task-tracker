import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
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
    ThrottlerModule.forRoot([{ ttl: TIME.ONE_MINUTE.IN_MS, limit: 10 }]),
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
