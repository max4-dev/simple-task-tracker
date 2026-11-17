import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { TIME } from '../../common/constants/index.js';
import { NoStoreInterceptor } from '../../common/http/no-store.interceptor.js';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { CurrentUser } from '../user/decorators/user.decorator.js';
import { OrganizationService } from './organization.service.js';
import { OrganizationRolesService } from './organization-roles.service.js';
import { OrganizationMembersService } from './organization-members.service.js';
import {
  AssignOrganizationRoleDto,
  CreateOrganizationDto,
  CreateOrganizationRoleDto,
  DeleteOrganizationDto,
  OrganizationDto,
  OrganizationMemberDto,
  OrganizationMemberPageDto,
  OrganizationPageDto,
  OrganizationRoleDto,
  OrganizationRolePageDto,
  PageQueryDto,
  TransferOwnershipDto,
  UpdateOrganizationDto,
  UpdateOrganizationRoleDto,
} from './dto/organization.dto.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Организации')
@ApiCookieAuth('accessToken')
@ApiUnauthorizedResponse()
@ApiNotFoundResponse({
  description: 'Организация/запись недоступна или отсутствует',
})
@UseInterceptors(NoStoreInterceptor)
@Auth()
@Controller('organizations')
export class OrganizationController {
  constructor(
    private readonly organizations: OrganizationService,
    private readonly roles: OrganizationRolesService,
    private readonly members: OrganizationMembersService,
  ) {}

  @Post()
  @ApiCreatedResponse({ type: OrganizationDto })
  @ApiOperation({ summary: 'Создать организацию и стать её owner' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.organizations.create(userId, dto);
  }

  @Get()
  @ApiOkResponse({ type: OrganizationPageDto })
  list(@CurrentUser('id') userId: string, @Query() query: PageQueryDto) {
    return this.organizations.list(userId, query);
  }

  @Get(':organizationId')
  @ApiOkResponse({ type: OrganizationDto })
  get(
    @Param('organizationId', uuid) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.organizations.get(id, userId);
  }

  @Patch(':organizationId')
  @ApiOkResponse({ type: OrganizationDto })
  update(
    @Param('organizationId', uuid) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizations.update(id, userId, dto);
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: TIME.ONE_MINUTE.IN_MS } })
  @Delete(':organizationId')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiOperation({
    summary:
      'Owner: безвозвратно удалить организацию и все её данные, подтвердив пароль',
  })
  delete(
    @Param('organizationId', uuid) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: DeleteOrganizationDto,
  ) {
    return this.organizations.delete(id, userId, dto);
  }

  @Post(':organizationId/transfer-ownership')
  @HttpCode(200)
  @ApiOkResponse({ type: OrganizationDto })
  @ApiOperation({ summary: 'Owner: передать владение существующему участнику' })
  transfer(
    @Param('organizationId', uuid) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: TransferOwnershipDto,
  ) {
    return this.organizations.transferOwnership(id, userId, dto);
  }

  @Post(':organizationId/leave')
  @HttpCode(204)
  @ApiNoContentResponse()
  leave(
    @Param('organizationId', uuid) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.organizations.leave(id, userId);
  }

  @Get(':organizationId/members')
  @ApiOkResponse({ type: OrganizationMemberPageDto })
  listMembers(
    @Param('organizationId', uuid) id: string,
    @CurrentUser('id') userId: string,
    @Query() query: PageQueryDto,
  ) {
    return this.members.list(id, userId, query);
  }

  @Patch(':organizationId/members/:userId/role')
  @ApiOkResponse({ type: OrganizationMemberDto })
  assignRole(
    @Param('organizationId', uuid) id: string,
    @CurrentUser('id') userId: string,
    @Param('userId', uuid) targetId: string,
    @Body() dto: AssignOrganizationRoleDto,
  ) {
    return this.members.assignRole(id, userId, targetId, dto);
  }

  @Delete(':organizationId/members/:userId')
  @HttpCode(204)
  @ApiNoContentResponse()
  removeMember(
    @Param('organizationId', uuid) id: string,
    @CurrentUser('id') userId: string,
    @Param('userId', uuid) targetId: string,
  ) {
    return this.members.remove(id, userId, targetId);
  }

  @Get(':organizationId/roles')
  @ApiOkResponse({ type: OrganizationRolePageDto })
  listRoles(
    @Param('organizationId', uuid) id: string,
    @CurrentUser('id') userId: string,
    @Query() query: PageQueryDto,
  ) {
    return this.roles.list(id, userId, query);
  }

  @Post(':organizationId/roles')
  @ApiCreatedResponse({ type: OrganizationRoleDto })
  createRole(
    @Param('organizationId', uuid) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateOrganizationRoleDto,
  ) {
    return this.roles.create(id, userId, dto);
  }

  @Patch(':organizationId/roles/:roleId')
  @ApiOkResponse({ type: OrganizationRoleDto })
  updateRole(
    @Param('organizationId', uuid) id: string,
    @CurrentUser('id') userId: string,
    @Param('roleId', uuid) roleId: string,
    @Body() dto: UpdateOrganizationRoleDto,
  ) {
    return this.roles.update(id, userId, roleId, dto);
  }

  @Delete(':organizationId/roles/:roleId')
  @HttpCode(204)
  @ApiNoContentResponse()
  deleteRole(
    @Param('organizationId', uuid) id: string,
    @CurrentUser('id') userId: string,
    @Param('roleId', uuid) roleId: string,
  ) {
    return this.roles.delete(id, userId, roleId);
  }
}
