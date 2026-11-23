import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { NotificationKind } from '../../../generated/prisma/client.js';
export class NotificationQueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
  @ApiPropertyOptional({ enum: ['all', 'unread'], default: 'all' })
  @IsIn(['all', 'unread'])
  state: 'all' | 'unread' = 'all';
  @ApiPropertyOptional({ description: 'Opaque cursor; keep the same filter' })
  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  @MaxLength(512)
  after?: string;
}
export class NotificationTargetDto {
  @ApiProperty() organizationId: string;
  @ApiProperty() projectId: string;
  @ApiProperty() taskId: string;
}
export class NotificationDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: NotificationKind }) kind: NotificationKind;
  @ApiProperty() title: string;
  @ApiProperty() body: string;
  @ApiProperty({ type: String, nullable: true }) actorId: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) readAt:
    string | null;
  @ApiProperty() available: boolean;
  @ApiProperty({ type: NotificationTargetDto, nullable: true })
  target: NotificationTargetDto | null;
}
export class NotificationPageDto {
  @ApiProperty({ type: [NotificationDto] }) items: NotificationDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor: string | null;
}
export class NotificationCountDto {
  @ApiProperty() count: number;
}

export class NotificationReadDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'date-time' }) readAt: string;
}
