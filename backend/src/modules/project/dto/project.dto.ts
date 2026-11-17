import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  OrganizationRoleDto,
  PageQueryDto,
} from '../../organization/dto/organization.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ProjectPageQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    enum: ['active', 'archived', 'all'],
    default: 'active',
  })
  @IsIn(['active', 'archived', 'all'])
  state: 'active' | 'archived' | 'all' = 'active';
}
export class CreateProjectDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name: string;

  @ApiProperty({ minLength: 3, maxLength: 64, example: 'web-app' })
  @Transform(trim)
  @IsString()
  @Length(3, 64)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 10000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(10000)
  description?: string | null;

  @ApiProperty({ minLength: 1, maxLength: 32, example: 'WEB' })
  @Transform(trim)
  @IsString()
  @Length(1, 32)
  @Matches(/^[A-Za-z][A-Za-z0-9]*(-[A-Za-z0-9]+)*$/)
  taskPrefix: string;
}
export class UpdateProjectDto {
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

  @ApiPropertyOptional({ nullable: true, maxLength: 10000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(10000)
  description?: string | null;

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 32,
    description: 'Editable only before the first issued task number',
  })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @Length(1, 32)
  @Matches(/^[A-Za-z][A-Za-z0-9]*(-[A-Za-z0-9]+)*$/)
  taskPrefix?: string;
}
export class AddProjectMemberDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  userId: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'Omitted/null inherits the organization role live',
  })
  @IsOptional()
  @IsUUID('4')
  roleId?: string | null;
}
export class UpdateProjectMemberRoleDto {
  @ApiProperty({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'null restores live inheritance',
  })
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4')
  roleId: string | null;
}
export class DeleteProjectDto {
  @ApiProperty({ minLength: 1, maxLength: 128, writeOnly: true })
  @IsString()
  @Length(1, 128)
  password: string;
}
export class ProjectDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) organizationId: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiProperty({ type: String, nullable: true }) description: string | null;
  @ApiProperty() taskPrefix: string;
  @ApiProperty() lastTaskNumber: number;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  archivedAt: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt: Date;
}
export class ProjectPageDto {
  @ApiProperty({ type: [ProjectDto] }) items: ProjectDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor: string | null;
}
export class ProjectMemberDto {
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
  @ApiProperty({ type: String, nullable: true }) avatarUrl: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) projectRoleId:
    string | null;
  @ApiProperty({ type: OrganizationRoleDto, nullable: true })
  role: OrganizationRoleDto | null;
  @ApiProperty({ enum: ['owner', 'project', 'organization', 'none'] })
  roleSource: string;
  @ApiProperty({ type: String, format: 'date-time' }) joinedAt: Date;
}
export class ProjectMemberPageDto {
  @ApiProperty({ type: [ProjectMemberDto] }) items: ProjectMemberDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor: string | null;
}
