import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export interface AuthorizationUser {
  id: string;
  username: string;
  email: string;
  role: import('../../generated/prisma/client').UserRole;
}

@Injectable()
export class AuthService {
  private static readonly PASSWORD_SALT_ROUNDS = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const password = await bcrypt.hash(
      dto.password,
      AuthService.PASSWORD_SALT_ROUNDS,
    );

    return this.prisma.user.create({
      data: {
        username: dto.username,
        password,
        email: dto.email,
      },
      select: {
        id: true,
        username: true,
        email: true,
      },
    });
  }

  async login(dto: LoginDto): Promise<{ auth_token: string }> {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    const isValidPassword =
      user && (await bcrypt.compare(dto.password, user.password));

    if (!user || !isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const authToken = await this.jwtService.signAsync({
      sub: user.id,
      username: user.username,
    });

    return { auth_token: authToken };
  }

  async findUserById(userId: string): Promise<AuthorizationUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }
}
