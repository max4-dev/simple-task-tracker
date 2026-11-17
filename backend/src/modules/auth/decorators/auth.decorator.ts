import { applyDecorators, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from './role.decorator.js';
import { Role } from '../../user/role.js';
import { RoleGuard } from '../guards/role.guard.js';

export const Auth = (...roles: Role[]) => {
  if (roles.length === 0) {
    return applyDecorators(UseGuards(AuthGuard('jwt'), RoleGuard));
  }
  return applyDecorators(
    Roles(...roles),
    UseGuards(AuthGuard('jwt'), RoleGuard),
  );
};
