import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { notificationCursor } from './notification.service.js';
import { NotificationQueryDto } from './dto/notification.dto.js';

describe('notification input and cursors', () => {
  const user = randomUUID();
  const payload = {
    user,
    state: 'unread',
    id: randomUUID(),
    at: '2026-11-20T12:00:00.000Z',
  };
  const cursor = Buffer.from(JSON.stringify(payload)).toString('base64url');
  it('round trips and scopes to the recipient and filter', () => {
    expect(notificationCursor(cursor, user, 'unread')).toEqual(payload);
    expect(() => notificationCursor(cursor, randomUUID(), 'unread')).toThrow();
    expect(() => notificationCursor(cursor, user, 'all')).toThrow();
  });
  it.each(['bad', '', Buffer.from('null').toString('base64url')])(
    'rejects malformed cursors %s',
    (raw) => expect(() => notificationCursor(raw, user, 'all')).toThrow(),
  );
  it.each([
    { limit: 0 },
    { limit: 101 },
    { state: 'admin' },
    { after: 'a'.repeat(513) },
  ])('rejects invalid queries %#', async (body) =>
    expect(
      (await validate(plainToInstance(NotificationQueryDto, body))).length,
    ).toBeGreaterThan(0),
  );
});
