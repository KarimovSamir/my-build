import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { Role } from '@mybuild/shared';

import type { AuthUser } from '../../modules/auth/auth-user.js';
import { NotDemoGuard } from './not-demo.guard.js';

function contextFor(user: AuthUser | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const user: AuthUser = {
  id: 'u1',
  email: 'a@b.test',
  emailVerified: true,
  role: Role.COMPANY,
  isDemo: false,
};

describe('NotDemoGuard', () => {
  const guard = new NotDemoGuard();

  it('пропускает обычную учётку', () => {
    expect(guard.canActivate(contextFor(user))).toBe(true);
  });

  it('отказывает демо-учётке с объяснением', () => {
    expect(() =>
      guard.canActivate(contextFor({ ...user, isDemo: true })),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(contextFor({ ...user, isDemo: true })),
    ).toThrow(/Демо-аккаунт/);
  });
});
