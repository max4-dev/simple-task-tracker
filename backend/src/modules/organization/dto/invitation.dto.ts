import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsHexadecimal,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateInvitationDto {
  @ApiProperty({ maxLength: 254 })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'A visual role from this organization; owner cannot be invited',
  })
  @IsUUID('4')
  roleId: string;
}
export class AcceptInvitationDto {
  @ApiProperty({ minLength: 64, maxLength: 64, writeOnly: true })
  @IsHexadecimal()
  @Length(64, 64)
  token: string;
}
export class InvitationDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) organizationId: string;
  @ApiProperty() email: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) roleId:
    string | null;
  @ApiProperty({ description: 'Role name at invitation creation' })
  roleName: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) invitedById:
    string | null;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt: Date;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  acceptedAt: Date | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  revokedAt: Date | null;
}
export class CreatedInvitationDto extends InvitationDto {
  @ApiProperty({ description: 'Shown only once. Treat this URL as a secret.' })
  invitationUrl: string;
}
export class InvitationPageDto {
  @ApiProperty({ type: [InvitationDto] }) items: InvitationDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor: string | null;
}
export class AcceptedInvitationDto {
  @ApiProperty({ format: 'uuid' }) organizationId: string;
}
