import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class PageQueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'ID of the last item from the previous page',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsUUID('4')
  after?: string;
}

export class CreateOrganizationDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name: string;

  @ApiProperty({ minLength: 3, maxLength: 64, example: 'my-team' })
  @Transform(trim)
  @IsString()
  @Length(3, 64)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug: string;
}

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional({ minLength: 3, maxLength: 64 })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @Length(3, 64)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;
}

export class CreateOrganizationRoleDto {
  @ApiProperty({ minLength: 1, maxLength: 80 })
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  name: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

export class UpdateOrganizationRoleDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 80 })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  name?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

export class AssignOrganizationRoleDto {
  @ApiProperty({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'null removes the visual role; it does not grant owner',
  })
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4')
  roleId: string | null;
}

export class TransferOwnershipDto {
  @ApiProperty({
    format: 'uuid',
    description: 'An existing member of this organization',
  })
  @IsUUID('4')
  userId: string;
}

export class OrganizationRoleDto {
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) id:
    string | null;
  @ApiProperty() name: string;
  @ApiProperty({ type: String, nullable: true }) description: string | null;
  @ApiProperty() isSystem: boolean;
}

export class OrganizationDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiProperty({ format: 'uuid' }) ownerUserId: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt: Date;
  @ApiProperty({ type: () => OrganizationRoleDto, nullable: true })
  myRole: OrganizationRoleDto | null;
}

export class OrganizationMemberDto {
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
  @ApiProperty({ type: String, nullable: true }) avatarUrl: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) joinedAt: Date;
  @ApiProperty({ type: () => OrganizationRoleDto, nullable: true })
  role: OrganizationRoleDto | null;
}

export class OrganizationPageDto {
  @ApiProperty({ type: [OrganizationDto] }) items: OrganizationDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor: string | null;
}
export class OrganizationMemberPageDto {
  @ApiProperty({ type: [OrganizationMemberDto] })
  items: OrganizationMemberDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor: string | null;
}
export class OrganizationRolePageDto {
  @ApiProperty({ type: OrganizationRoleDto }) systemRole: OrganizationRoleDto;
  @ApiProperty({ type: [OrganizationRoleDto] }) items: OrganizationRoleDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor: string | null;
}

export class DeleteOrganizationDto {
  @ApiProperty({ minLength: 1, maxLength: 128, writeOnly: true })
  @IsString()
  @Length(1, 128)
  password: string;
}
