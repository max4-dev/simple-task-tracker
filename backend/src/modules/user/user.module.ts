import { AuthModule } from '../auth/auth.module.js';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module.js';
import { TokenModule } from '../../common/redis/token.module.js';
import { UserController } from './user.controller.js';
import { UserService } from './user.service.js';

@Module({
  imports: [DatabaseModule, TokenModule, AuthModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
