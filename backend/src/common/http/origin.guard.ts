import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    // Browser cookie writes must come from an explicitly trusted origin.
    // Non-browser clients must send Origin too; never trust the request Host.
    if (
      !this.config
        .getOrThrow<string[]>('TRUSTED_ORIGINS')
        .includes(request.get('Origin'))
    ) {
      throw new ForbiddenException('Недопустимый источник запроса');
    }
    return true;
  }
}
