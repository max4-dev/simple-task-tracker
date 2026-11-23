import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { TaskStatusCategory } from '../../../generated/prisma/client.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateProjectStatusDto {
  @ApiProperty({ minLength: 1, maxLength: 80 })
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  name: string;

  @ApiPropertyOptional({ enum: TaskStatusCategory, default: 'TODO' })
  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(TaskStatusCategory)
  category?: TaskStatusCategory;

  @ApiPropertyOptional({ example: '#64748b', default: '#64748b' })
  @ValidateIf((_, value) => value !== undefined)
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 1000000,
    description: 'Omitted: append after the last column',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(1000000)
  position?: number;
}
export class UpdateProjectStatusDto extends PartialType(
  OmitType(CreateProjectStatusDto, ['position'] as const),
  { skipNullProperties: false },
) {}

export class DeleteProjectStatusDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Required when the status contains tasks; must be another status in this project',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsUUID('4')
  replacementStatusId?: string;
}
export class ProjectStatusDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) projectId: string;
  @ApiProperty() name: string;
  @ApiProperty() color: string;
  @ApiProperty({ enum: TaskStatusCategory }) category: TaskStatusCategory;
  @ApiProperty() position: number;
}
export class CreateProjectTagDto {
  @ApiProperty({ minLength: 1, maxLength: 80 })
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  name: string;

  @ApiProperty({ minLength: 1, maxLength: 32, example: 'feat' })
  @Transform(trim)
  @IsString()
  @Length(1, 32)
  @Matches(/^[a-z][a-z0-9-]*$/)
  branchPrefix: string;

  @ApiPropertyOptional({ example: '#64748b', default: '#64748b' })
  @ValidateIf((_, value) => value !== undefined)
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;
}
export class UpdateProjectTagDto extends PartialType(CreateProjectTagDto, {
  skipNullProperties: false,
}) {}

export class ProjectTagDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) projectId: string;
  @ApiProperty() name: string;
  @ApiProperty() branchPrefix: string;
  @ApiProperty() color: string;
}
export class ProjectTagPageDto {
  @ApiProperty({ type: [ProjectTagDto] }) items: ProjectTagDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor: string | null;
}
