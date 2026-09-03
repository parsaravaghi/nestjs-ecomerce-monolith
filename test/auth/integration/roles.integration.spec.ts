import {
  ExecutionContext,
  ForbiddenException,
  INestApplication,
} from '@nestjs/common';
import { PrismaService } from '../../../src/database/prisma.service';
import { Roles } from '../../../src/common/decorators/roles.decorator';
import { UserRole } from '../../../src/generated/prisma/client';
import { AuthService } from '../../../src/modules/auth/auth.service';
import { RolesGuard } from '../../../src/modules/auth/guards/roles.guard';
import { createTestApp } from '../../helpers/test-app';

@Roles(UserRole.ADMIN)
class AdminController {
  handler(this: void) {}
}

describe('Role authorization database integration', () => {
  let app: INestApplication;
  let authService: AuthService;
  let rolesGuard: RolesGuard;
  let prisma: PrismaService;
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const usernames = {
    admin: `role_admin_${suffix}`,
    user: `role_user_${suffix}`,
  };

  const contextFor = (userId: string): ExecutionContext =>
    ({
      getHandler: () => AdminController.prototype.handler,
      getClass: () => AdminController,
      switchToHttp: () => ({ getRequest: () => ({ user: { sub: userId } }) }),
    }) as unknown as ExecutionContext;

  beforeAll(async () => {
    app = await createTestApp();
    authService = app.get(AuthService);
    rolesGuard = app.get(RolesGuard);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { username: { in: Object.values(usernames) } },
    });
    await app.close();
  });

  it('persists explicit ADMIN and default USER roles and loads them safely', async () => {
    const [admin, user] = await Promise.all([
      prisma.user.create({
        data: {
          username: usernames.admin,
          email: `${usernames.admin}@example.com`,
          password: 'integration-only-hash',
          role: UserRole.ADMIN,
        },
      }),
      prisma.user.create({
        data: {
          username: usernames.user,
          email: `${usernames.user}@example.com`,
          password: 'integration-only-hash',
        },
      }),
    ]);

    await expect(authService.findUserById(admin.id)).resolves.toEqual({
      id: admin.id,
      username: usernames.admin,
      email: `${usernames.admin}@example.com`,
      role: UserRole.ADMIN,
    });
    expect(user.role).toBe(UserRole.USER);

    await expect(rolesGuard.canActivate(contextFor(admin.id))).resolves.toBe(
      true,
    );
    await expect(
      rolesGuard.canActivate(contextFor(user.id)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
