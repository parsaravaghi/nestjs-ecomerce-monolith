import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jest } from '@jest/globals';
import { ROLES_KEY } from '../../../src/common/decorators/roles.decorator';
import { UserRole } from '../../../src/generated/prisma/client';
import { AuthService } from '../../../src/modules/auth/auth.service';
import { RolesGuard } from '../../../src/modules/auth/guards/roles.guard';

describe('RolesGuard', () => {
  const handler = () => undefined;
  class TestController {}

  const reflector = { getAllAndOverride: jest.fn() };
  const authService = { findUserById: jest.fn() };
  const guard = new RolesGuard(
    reflector as unknown as Reflector,
    authService as unknown as AuthService,
  );

  const context = (userId?: string): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => TestController,
      switchToHttp: () => ({
        getRequest: () => ({ user: userId ? { sub: userId } : undefined }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => jest.clearAllMocks());

  it('allows routes without role metadata', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(authService.findUserById).not.toHaveBeenCalled();
  });

  it('allows an ADMIN user on an ADMIN route and reads request.user.sub', async () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    authService.findUserById.mockResolvedValue({ role: UserRole.ADMIN });

    await expect(guard.canActivate(context('admin-id'))).resolves.toBe(true);
    expect(authService.findUserById).toHaveBeenCalledWith('admin-id');
  });

  it('allows SUPERUSER when either ADMIN or SUPERUSER is accepted', async () => {
    reflector.getAllAndOverride.mockReturnValue([
      UserRole.ADMIN,
      UserRole.SUPERUSER,
    ]);
    authService.findUserById.mockResolvedValue({ role: UserRole.SUPERUSER });

    await expect(guard.canActivate(context('super-id'))).resolves.toBe(true);
  });

  it('rejects USER on an ADMIN route with ForbiddenException', async () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    authService.findUserById.mockResolvedValue({ role: UserRole.USER });

    await expect(guard.canActivate(context('user-id'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects missing authenticated user context', async () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('requests handler metadata before controller metadata for overrides', async () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    authService.findUserById.mockResolvedValue({ role: UserRole.ADMIN });

    await guard.canActivate(context('admin-id'));

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
      handler,
      TestController,
    ]);
  });

  it('honors controller-level metadata returned by Reflector', async () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.SUPERUSER]);
    authService.findUserById.mockResolvedValue({ role: UserRole.SUPERUSER });

    await expect(guard.canActivate(context('super-id'))).resolves.toBe(true);
  });
});
