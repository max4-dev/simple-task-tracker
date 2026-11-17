import { Module } from '@nestjs/common';
import { TokenService } from './token.service.js';
import { RedisModule } from './redis.module.js';

@Module({
  imports: [RedisModule],
  providers: [TokenService],
  exports: [TokenService],
})
export class TokenModule {}
