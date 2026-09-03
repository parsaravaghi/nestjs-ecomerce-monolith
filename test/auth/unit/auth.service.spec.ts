import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { jest } from '@jest/globals';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../../../src/modules/auth/auth.service';
import { PrismaService } from '../../../src/database/prisma.service';
import { UserRole } from '../../../src/generated/prisma/client';

describe('AuthService', () => {
  const prisma = {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const jwt = { signAsync: jest.fn() };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt as unknown as JwtService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('hashes the password and excludes it from the registration selection', async () => {
    prisma.user.create.mockImplementation(() =>
      Promise.resolve({
        id: 'user-id',
        username: 'tester',
        email: 'tester@example.com',
      }),
    );

    const result = await service.register({
      username: 'tester',
      password: 'Password123',
      email: 'tester@example.com',
    });

    const createInput = prisma.user.create.mock.calls[0][0];
    expect(createInput.select).toEqual({
      id: true,
      username: true,
      email: true,
    });
    expect(createInput.data.password).not.toBe('Password123');
    await expect(
      bcrypt.compare('Password123', createInput.data.password),
    ).resolves.toBe(true);
    expect(result).not.toHaveProperty('password');
  });

  it('returns a signed token for valid credentials', async () => {
    const password = await bcrypt.hash('Password123', 4);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      username: 'tester',
      password,
    });
    jwt.signAsync.mockResolvedValue('signed-token');

    await expect(
      service.login({ username: 'tester', password: 'Password123' }),
    ).resolves.toEqual({ auth_token: 'signed-token' });
    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: 'user-id',
      username: 'tester',
    });
  });

  it('rejects invalid credentials with one generic response', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.login({ username: 'missing', password: 'Password123' }),
    ).rejects.toEqual(new UnauthorizedException('Invalid credentials'));
  });

  it('finds an authorization user by ID without selecting the password', async () => {
    const user = {
      id: 'user-id',
      username: 'tester',
      email: 'tester@example.com',
      role: UserRole.ADMIN,
    };
    prisma.user.findUnique.mockResolvedValue(user);

    await expect(service.findUserById('user-id')).resolves.toEqual(user);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
      },
    });
  });

  it('throws the project not-found response when an authorization user is missing', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.findUserById('missing-id')).rejects.toEqual(
      new NotFoundException('User not found'),
    );
  });
});
