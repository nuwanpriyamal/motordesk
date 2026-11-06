import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { Role } from '../common/constants';
import { AuthUser } from '../common/decorators';
import { RealtimeService } from '../realtime/realtime.service';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import { LoginDto, RegisterDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly tenants: TenantsService,
    private readonly jwt: JwtService,
    private readonly firebase: RealtimeService,
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

  providers() {
    const firebase = this.firebase.webConfig;
    return { google: !!firebase, firebase };
  }

  private async verifyGoogle(idToken: string) {
    const google = await this.firebase.verifyGoogleIdToken(idToken);
    if (!google) throw new UnauthorizedException('Google sign-in failed. Please try again.');
    return google;
  }

  /**
   * Logs in an existing user whose email matches the Google account.
   * Unknown emails get 404 NO_ACCOUNT so the web app can offer sign-up.
   */
  async googleLogin(idToken: string) {
    const google = await this.verifyGoogle(idToken);
    const user = await this.users.findByEmailWithPassword(google.email);
    if (!user) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'NO_ACCOUNT',
        message: 'No MotorDesk account uses this Google email yet.',
        email: google.email,
        name: google.name,
      });
    }
    if (!user.active) throw new UnauthorizedException('This account is deactivated');
    await this.users.touchLogin(String(user._id));
    return this.issue(user);
  }

  async register(dto: RegisterDto) {
    if (dto.googleIdToken) {
      // Trust only the verified Google email, never the one in the form.
      const google = await this.verifyGoogle(dto.googleIdToken);
      dto.email = google.email;
      // Unusable random password: the owner signs in with Google, or sets one later.
      dto.password = randomBytes(32).toString('base64url');
    }
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
      password: dto.password!,
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
