import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerRequest } from '@nestjs/throttler';
import type { AuthenticatedUser } from '../interface/jwt.interface.js';

@Injectable()
export class PasswordThrottlerGuard extends ThrottlerGuard {
  protected async handleRequest(props: ThrottlerRequest): Promise<boolean> {
    // Class-level authentication runs first. Never key the user limit by input DTO.
    const { user } = props.context
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();
    await super.handleRequest({
      ...props,
      limit: 5,
      throttler: { ...props.throttler, name: 'password-user' },
      getTracker: () => Promise.resolve(user.id),
    });
    return super.handleRequest({
      ...props,
      limit: 20,
      throttler: { ...props.throttler, name: 'password-ip' },
      getTracker: (req) => this.getTracker(req),
    });
  }
}
