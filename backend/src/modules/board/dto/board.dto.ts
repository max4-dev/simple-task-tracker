import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ProjectStatusDto } from '../../project/dto/project-board.dto.js';
import {
  ListTasksQueryDto,
  TaskRevisionDto,
} from '../../task/dto/task-input.dto.js';
import { TaskDto, TaskSummaryDto } from '../../task/dto/task-response.dto.js';

export class BoardFiltersDto extends PickType(ListTasksQueryDto, [
  'tagId',
  'memberId',
  'assignmentKind',
  'q',
] as const) {}
export class BoardColumnQueryDto extends BoardFiltersDto {
  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;

  @ApiPropertyOptional({
    description:
      'Opaque cursor returned by this column with the same filters; changed board returns 409 BOARD_CHANGED',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(1024)
  after?: string;
}
export class BoardQueryDto extends BoardFiltersDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  columnLimit = 20;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  cardLimit = 10;

  @ApiPropertyOptional({
    description: 'Opaque cursor for the next page of columns',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(1024)
  afterColumn?: string;
}
export class MoveTaskDto extends TaskRevisionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  statusId: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Immediate preceding active card in full column order, excluding moved task; null means start',
  })
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4')
  previousTaskId: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Immediate following active card; null means end. Both null only for an empty destination.',
  })
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4')
  nextTaskId: string | null;
}
export class ReorderColumnsDto {
  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  expectedBoardRevision: number;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'Complete desired column order, including empty columns. Stale or incomplete set returns 409.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  statusIds: string[];
}
export class BoardColumnPageDto {
  @ApiProperty() boardRevision: number;
  @ApiProperty() total: number;
  @ApiProperty({ type: [TaskSummaryDto] }) items: TaskSummaryDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor: string | null;
}
export class BoardColumnDto extends ProjectStatusDto {
  @ApiProperty({ type: BoardColumnPageDto }) cards: BoardColumnPageDto;
}
export class BoardDto {
  @ApiProperty() boardRevision: number;
  @ApiProperty() totalColumns: number;
  @ApiProperty({ type: [BoardColumnDto] }) columns: BoardColumnDto[];
  @ApiProperty({ type: String, nullable: true }) nextColumnCursor:
    string | null;
}
export class MoveTaskResponseDto {
  @ApiProperty() boardRevision: number;
  @ApiProperty({ type: TaskDto }) task: TaskDto;
}
export class ColumnOrderDto {
  @ApiProperty() boardRevision: number;
  @ApiProperty({ type: [String] }) statusIds: string[];
}
