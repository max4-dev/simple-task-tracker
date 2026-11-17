import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const httpUrl = {
  protocols: ['http', 'https'],
  require_protocol: true,
  disallow_auth: true,
};

export class SocialLinkDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(trim)
  label?: string | null;

  @ApiProperty({ maxLength: 2048 })
  @IsUrl(httpUrl)
  @MaxLength(2048)
  @Transform(trim)
  url: string;
}

export class WorkIntervalDto {
  @ApiProperty({ minimum: 1, maximum: 7, description: 'ISO weekday: Monday=1' })
  @IsInt()
  @Min(1)
  @Max(7)
  weekday: number;

  @ApiProperty({ minimum: 0, maximum: 1439 })
  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute: number;

  @ApiProperty({ minimum: 1, maximum: 1440 })
  @IsInt()
  @Min(1)
  @Max(1440)
  endMinute: number;
}

export class UserProfileDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Length(1, 100)
  @Transform(trim)
  name?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 2048 })
  @IsOptional()
  @IsUrl(httpUrl)
  @MaxLength(2048)
  @Transform(trim)
  avatarUrl?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'International phone number, e.g. +79991234567',
  })
  @IsOptional()
  @Matches(/^\+[1-9]\d{6,14}$/)
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(trim)
  bio?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 'https://github.com/octocat',
  })
  @IsOptional()
  @IsUrl(httpUrl)
  @MaxLength(100)
  @Matches(/^https:\/\/github\.com\/[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?\/?$/i)
  @Transform(trim)
  githubUrl?: string | null;

  @ApiPropertyOptional({ example: 'Europe/Moscow' })
  @ValidateIf((_, value) => value !== undefined)
  @IsTimeZone()
  @MaxLength(100)
  timeZone?: string;

  @ApiPropertyOptional({
    type: [SocialLinkDto],
    maxItems: 20,
    description: 'Replaces all links; [] clears them',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique((link: SocialLinkDto) => link?.url)
  @ValidateNested({ each: true })
  @Type(() => SocialLinkDto)
  socialLinks?: SocialLinkDto[];

  @ApiPropertyOptional({
    type: [WorkIntervalDto],
    maxItems: 28,
    description: 'Replaces schedule. Split overnight shifts at midnight.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(28)
  @ValidateNested({ each: true })
  @Type(() => WorkIntervalDto)
  workIntervals?: WorkIntervalDto[];
}

export class UserPasswordDto {
  @ApiProperty({ maxLength: 128, writeOnly: true })
  @IsString()
  @Length(1, 128)
  password: string;

  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  @Length(12, 128)
  newPassword: string;
}

export class UserDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true }) avatarUrl: string | null;
  @ApiPropertyOptional({ nullable: true }) bio: string | null;
  @ApiPropertyOptional({ nullable: true }) githubUrl: string | null;
  @ApiProperty() timeZone: string;
  @ApiProperty() isWorkingNow: boolean;
  @ApiProperty({ type: [SocialLinkDto] }) socialLinks: SocialLinkDto[];
  @ApiProperty({ type: [WorkIntervalDto] }) workIntervals: WorkIntervalDto[];
  @ApiPropertyOptional({
    description: 'Self or common organization members only',
  })
  email?: string;
  @ApiPropertyOptional({ nullable: true }) phone?: string | null;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'date-time',
    description: 'Self only',
  })
  emailVerifiedAt?: Date | null;
}

export class SharedOrganizationDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
}

export class SharedProjectDto extends SharedOrganizationDto {
  @ApiProperty({ format: 'uuid' }) organizationId: string;
  @ApiProperty() taskPrefix: string;
}

export class ColleagueProfileDto extends UserDto {
  @ApiProperty({ type: [SharedOrganizationDto] })
  sharedOrganizations: SharedOrganizationDto[];
  @ApiProperty({ type: [SharedProjectDto] }) sharedProjects: SharedProjectDto[];
}
