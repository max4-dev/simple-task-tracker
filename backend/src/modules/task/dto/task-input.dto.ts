import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
  PartialType,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  NotContains,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { TaskAssignmentKind } from '../../../generated/prisma/client.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class TaskAssignmentInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  userId: string;

  @ApiProperty({ enum: TaskAssignmentKind })
  @IsEnum(TaskAssignmentKind)
  kind: TaskAssignmentKind;
}

export class TaskFieldsDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @Transform(trim)
  @IsString()
  @NotContains('\0')
  @Length(1, 200)
  title: string;

  @ApiPropertyOptional({
    maxLength: 50000,
    default: '',
    description: 'Raw Markdown; render safely on the client',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @NotContains('\0')
  @MaxLength(50000)
  description?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Create default: first BACKLOG status, otherwise first project status',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsUUID('4')
  statusId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  tagId?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'ISO 8601 timestamp with explicit timezone; null clears the due date',
  })
  @ValidateIf((_, value) => value != null)
  @IsDateString({ strict: true })
  @Matches(
    /^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/,
  )
  dueAt?: string | null;
}

export class TaskAssignmentsDto {
  @ApiProperty({
    type: [TaskAssignmentInputDto],
    maxItems: 100,
    description:
      'Full desired assignment set. Empty array removes all assignments.',
  })
  @IsArray()
  @IsObject({ each: true })
  @ArrayMaxSize(100)
  @ArrayUnique(
    (item: TaskAssignmentInputDto | null) =>
      item && `${item.userId}:${item.kind}`,
  )
  @ValidateNested({ each: true })
  @Type(() => TaskAssignmentInputDto)
  assignments: TaskAssignmentInputDto[];
}

export class CreateTaskDto extends IntersectionType(
  TaskFieldsDto,
  PartialType(TaskAssignmentsDto, { skipNullProperties: false }),
) {}

export class TaskRevisionDto {
  @ApiProperty({
    minimum: 1,
    maximum: 2147483647,
    description:
      'Last revision received from the server. Stale value returns 409 TASK_REVISION_CONFLICT.',
  })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  expectedRevision: number;
}

export class UpdateTaskDto extends IntersectionType(
  PartialType(TaskFieldsDto, { skipNullProperties: false }),
  TaskRevisionDto,
) {}
export class ReplaceTaskAssignmentsDto extends IntersectionType(
  TaskAssignmentsDto,
  TaskRevisionDto,
) {}

export class TaskPageQueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 2147483647,
    description:
      'Last task number (or event revision for history) from the previous page. Ordered ascending.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  after?: number;
}

export class ListTasksQueryDto extends TaskPageQueryDto {
  @ApiPropertyOptional({
    enum: ['active', 'archived', 'all'],
    default: 'active',
  })
  @IsIn(['active', 'archived', 'all'])
  archive: 'active' | 'archived' | 'all' = 'active';

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_, value) => value !== undefined)
  @IsUUID('4')
  statusId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_, value) => value !== undefined)
  @IsUUID('4')
  tagId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Assigned project participant, optionally restricted by assignmentKind',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsUUID('4')
  memberId?: string;

  @ApiPropertyOptional({ enum: TaskAssignmentKind })
  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(TaskAssignmentKind)
  assignmentKind?: TaskAssignmentKind;

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 200,
    description: 'Case-insensitive literal title substring',
  })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @NotContains('\0')
  @Length(1, 200)
  q?: string;
}
