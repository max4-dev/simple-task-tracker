import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiExcludeEndpoint,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { CurrentUser } from '../user/decorators/user.decorator.js';
import { NoStoreInterceptor } from '../../common/http/no-store.interceptor.js';
import { OrganizationInvitationsService } from './organization-invitations.service.js';
import { PageQueryDto } from './dto/organization.dto.js';
import {
  AcceptInvitationDto,
  AcceptedInvitationDto,
  CreateInvitationDto,
  CreatedInvitationDto,
  InvitationPageDto,
} from './dto/invitation.dto.js';

const uuid = new ParseUUIDPipe({ version: '4' });
@ApiTags('Приглашения в организации')
@ApiCookieAuth('accessToken')
@UseInterceptors(NoStoreInterceptor)
@Auth()
@Controller('organizations/:organizationId/invitations')
export class OrganizationInvitationsController {
  constructor(private readonly invitations: OrganizationInvitationsService) {}

  @Post()
  @ApiCreatedResponse({ type: CreatedInvitationDto })
  create(
    @Param('organizationId', uuid) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitations.create(id, userId, dto);
  }

  @Get()
  @ApiOkResponse({ type: InvitationPageDto })
  list(
    @Param('organizationId', uuid) id: string,
    @CurrentUser('id') userId: string,
    @Query() query: PageQueryDto,
  ) {
    return this.invitations.list(id, userId, query);
  }

  @Delete(':invitationId')
  @HttpCode(204)
  @ApiNoContentResponse()
  revoke(
    @Param('organizationId', uuid) id: string,
    @CurrentUser('id') userId: string,
    @Param('invitationId', uuid) invitationId: string,
  ) {
    return this.invitations.revoke(id, userId, invitationId);
  }
}

@ApiTags('Приглашения в организации')
@UseInterceptors(NoStoreInterceptor)
@Controller('organization-invitations')
export class AcceptOrganizationInvitationController {
  constructor(private readonly invitations: OrganizationInvitationsService) {}

  @Post('accept')
  @HttpCode(200)
  @Auth()
  @ApiCookieAuth('accessToken')
  @ApiOkResponse({ type: AcceptedInvitationDto })
  accept(@CurrentUser('id') userId: string, @Body() dto: AcceptInvitationDto) {
    return this.invitations.accept(userId, dto);
  }

  @Get('accept')
  @ApiExcludeEndpoint()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Referrer-Policy', 'no-referrer')
  landing(@Res({ passthrough: true }) response: Response) {
    const nonce = randomBytes(18).toString('base64');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'nonce-" +
        nonce +
        "'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    );
    // Fragment tokens never reach access logs or the server on this GET.
    return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Приглашение в организацию</title><main><h1>Приглашение в организацию</h1>
<p>Примите приглашение из аккаунта с указанной пригласившим почтой.</p>
<button id="accept" type="button">Принять приглашение</button><p id="status" role="status"></p></main>
<script nonce="${nonce}">
const token = new URLSearchParams(location.hash.slice(1)).get('token');
const button = document.getElementById('accept');
const status = document.getElementById('status');
if (!token || !/^[a-f0-9]{64}$/.test(token)) { button.disabled = true; status.textContent = 'Ссылка недействительна'; }
button.onclick = async () => {
  button.disabled = true;
  try {
    const response = await fetch('/organization-invitations/accept', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    if (response.ok) { history.replaceState(null, '', location.pathname); status.textContent = 'Вы присоединились к организации'; return; }
    status.textContent = response.status === 401 ? 'Войдите в нужный аккаунт, затем снова нажмите «Принять приглашение».' : response.status === 403 ? 'Проверьте, что вы вошли с почтой, указанной в приглашении.' : 'Приглашение недействительно, уже использовано или вы уже состоите в организации.';
  } catch { status.textContent = 'Не удалось связаться с сервером. Повторите попытку.'; }
  button.disabled = false;
};
</script></html>`;
  }
}
