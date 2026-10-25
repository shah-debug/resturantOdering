import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@app/contracts';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class EmailDto {
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(320)
  email!: string;
}

export class SignupDto extends EmailDto {
  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, {
    message: `Password must be ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters`,
  })
  password!: string;

  @Transform(trim)
  @IsString()
  @Length(2, 120)
  fullName!: string;
}

export class LoginDto extends EmailDto {
  @IsString()
  @Length(1, PASSWORD_MAX_LENGTH)
  password!: string;
}

export class TokenDto {
  @IsString()
  @Length(20, 200)
  token!: string;
}

export class ResetPasswordDto extends TokenDto {
  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, {
    message: `Password must be ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters`,
  })
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @Length(1, PASSWORD_MAX_LENGTH)
  currentPassword!: string;

  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, {
    message: `Password must be ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters`,
  })
  newPassword!: string;
}

export class AcceptInvitationDto extends TokenDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  fullName?: string;

  @IsOptional()
  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, {
    message: `Password must be ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters`,
  })
  password?: string;
}
