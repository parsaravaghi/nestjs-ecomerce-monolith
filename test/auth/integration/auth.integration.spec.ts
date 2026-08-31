import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../src/database/prisma.service';
import { AuthService } from '../../../src/modules/auth/auth.service';
import { createTestApp } from '../../helpers/test-app';

describe('Auth module database integration', () => {
  let app: INestApplication;
  let authService: AuthService;
  let prisma: PrismaService;
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const username = `auth_integration_${suffix}`;
  const email = `${username}@example.com`;

  beforeAll(async () => {
    app = await createTestApp();
    authService = app.get(AuthService);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username } });
    await app.close();
  });

  it('registers in PostgreSQL with a hash and logs in through JwtService', async () => {
    const registered = await authService.register({
      username,
      email,
      password: 'Password123',
    });
    const stored = await prisma.user.findUniqueOrThrow({ where: { username } });

    expect(registered).toEqual(
      expect.objectContaining({ id: stored.id, username, email }),
    );
    expect(registered).not.toHaveProperty('password');
    expect(stored.password).not.toBe('Password123');
    await expect(bcrypt.compare('Password123', stored.password)).resolves.toBe(
      true,
    );

    const login = await authService.login({
      username,
      password: 'Password123',
    });
    expect(login.auth_token).toEqual(expect.any(String));
  });
});
