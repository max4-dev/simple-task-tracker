import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class SessionUserDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() email: string;
  @ApiProperty() name: string;
}

export class SessionDto {
  @ApiProperty({ type: SessionUserDto }) user: SessionUserDto;
  @ApiProperty({
    description:
      'False means account created, but session unavailable: retry login, not registration.',
  })
  authenticated: boolean;
  @ApiPropertyOptional({ enum: ['SESSION_UNAVAILABLE'] })
  code?: 'SESSION_UNAVAILABLE';
}
