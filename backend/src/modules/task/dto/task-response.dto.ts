import { ApiProperty } from '@nestjs/swagger';
import { TaskEventKind } from '../../../generated/prisma/client.js';
import { TaskAssignmentInputDto } from './task-input.dto.js';

export class TaskSummaryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) projectId: string;
  @ApiProperty() number: number;
  @ApiProperty() revision: number;
  @ApiProperty({
    type: String,
    example: '1024.000000000000000',
    description: 'Exact board position, never a JavaScript number',
  })
  position: string;
  @ApiProperty({ example: 'WEB-1' }) key: string;
  @ApiProperty({ type: String, nullable: true, example: 'feat/WEB-1' })
  suggestedBranch: string | null;
  @ApiProperty() title: string;
  @ApiProperty({ format: 'uuid' }) statusId: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) tagId:
    string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) creatorId:
    string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) dueAt:
    string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  archivedAt: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
  @ApiProperty({ type: [TaskAssignmentInputDto] })
  assignments: TaskAssignmentInputDto[];
}
export class TaskDto extends TaskSummaryDto {
  @ApiProperty() description: string;
}
export class TaskPageDto {
  @ApiProperty({ type: [TaskSummaryDto] }) items: TaskSummaryDto[];
  @ApiProperty({ type: Number, nullable: true }) nextCursor: number | null;
}
export class TaskEventDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) taskId: string;
  @ApiProperty() revision: number;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) actorId:
    string | null;
  @ApiProperty({ enum: TaskEventKind }) kind: TaskEventKind;
  @ApiProperty({
    type: Object,
    additionalProperties: true,
    description:
      'Changed field names, status/tag IDs, and added/removed assignment pairs. Markdown bodies are not stored.',
  })
  changes: Record<string, unknown>;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}
export class TaskEventPageDto {
  @ApiProperty({ type: [TaskEventDto] }) items: TaskEventDto[];
  @ApiProperty({ type: Number, nullable: true }) nextCursor: number | null;
}
