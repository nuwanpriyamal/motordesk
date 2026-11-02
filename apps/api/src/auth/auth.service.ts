import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Role } from '../common/constants';
import { AuthUser } from '../common/decorators';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import { LoginDto, RegisterDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly tenants: TenantsService,
    private readonly jwt: JwtService,
  ) {}

  private issue(user: { _id: unknown; email: string; name: string; role: Role; tenantId: unknown }) {
    const payload: AuthUser = {
      sub: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId ? String(user.tenantId) : null,
    };
    return { accessToken: this.jwt.sign(payload), user: payload };
  }

  async login(dto: LoginDto) {
    const user = await this.users.findByEmailWithPassword(dto.email);
    if (!user || !user.active || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    await this.users.touchLogin(String(user._id));
    return this.issue(user);
  }

  async register(dto: RegisterDto) {
    // Check email first so we don't leave an orphan tenant behind.
    if (await this.users.findByEmailWithPassword(dto.email)) {
      throw new ConflictException('Email already registered');
    }
    const tenant = await this.tenants.create({
      name: dto.businessName,
      email: dto.email,
      phone: dto.phone,
      city: dto.city,
      planCode: dto.planCode,
    });
    const user = await this.users.createRaw({
      tenantId: String(tenant._id),
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      password: dto.password,
      role: Role.OWNER,
    });
    return this.issue(user as never);
  }

  async me(userId: string) {
    const user = await this.users.findById(userId);
    if (!user || !user.active) throw new UnauthorizedException();
    return user;
  }
}
