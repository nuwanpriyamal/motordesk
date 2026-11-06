import { IsEmail, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}

/** Self sign-up for a new service station: creates the tenant and its owner. */
export class RegisterDto {
  @IsString() @MinLength(2) businessName!: string;
  @IsString() @MinLength(2) name!: string;
  /** Ignored when googleIdToken is sent: the Google account's email is used. */
  @ValidateIf((o: RegisterDto) => !o.googleIdToken) @IsEmail() email!: string;
  /** Not needed when signing up with Google. */
  @ValidateIf((o: RegisterDto) => !o.googleIdToken) @IsString() @MinLength(8) password?: string;
  @IsOptional() @IsString() googleIdToken?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() planCode?: string;
}

export class GoogleLoginDto {
  @IsString() idToken!: string;
}

export class ChangePasswordDto {
  @IsString() currentPassword!: string;
  @IsString() @MinLength(8) newPassword!: string;
}
