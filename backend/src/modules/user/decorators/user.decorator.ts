import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/interface/jwt.interface.js';

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const user = ctx
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>().user;
    return data ? user[data] : user;
  },
);
