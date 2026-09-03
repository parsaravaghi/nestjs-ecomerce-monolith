import { Reflector } from '@nestjs/core';
import {
  ROLES_KEY,
  Roles,
} from '../../../src/common/decorators/roles.decorator';
import { UserRole } from '../../../src/generated/prisma/client';

describe('Roles decorator', () => {
  const reflector = new Reflector();

  it('stores one role under the reusable metadata key', () => {
    class TestController {
      @Roles(UserRole.ADMIN)
      handler(this: void) {}
    }

    expect(
      reflector.get<UserRole[]>(ROLES_KEY, TestController.prototype.handler),
    ).toEqual([UserRole.ADMIN]);
  });

  it('stores multiple roles under the reusable metadata key', () => {
    class TestController {
      @Roles(UserRole.ADMIN, UserRole.SUPERUSER)
      handler(this: void) {}
    }

    expect(
      reflector.get<UserRole[]>(ROLES_KEY, TestController.prototype.handler),
    ).toEqual([UserRole.ADMIN, UserRole.SUPERUSER]);
  });
});
