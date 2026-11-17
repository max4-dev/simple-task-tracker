import { ValidationPipe } from '@nestjs/common';
import { UserPasswordDto, UserProfileDto } from './user.dto.js';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const profile = (value: unknown) =>
  pipe.transform(value, { type: 'body', metatype: UserProfileDto });

describe('profile DTO', () => {
  it('distinguishes omitted fields, clearing a nullable field and clearing collections', async () => {
    expect(
      await profile({ bio: null, socialLinks: [], workIntervals: [] }),
    ).toMatchObject({ bio: null, socialLinks: [], workIntervals: [] });
    expect(await profile({ name: '  Ada  ' })).toMatchObject({ name: 'Ada' });
  });
  it.each([
    { email: 'new@example.test' },
    { role: 'ADMIN' },
    { tokenVersion: 100 },
    { id: 'another-user' },
    { name: '' },
    { name: '   ' },
    { name: null },
    { socialLinks: null },
    { workIntervals: null },
    { timeZone: null },
    { timeZone: 'Mars/Olympus' },
    { phone: 'invalid' },
    { avatarUrl: 'javascript:alert(1)' },
    { githubUrl: 'https://github.com.evil.test/user' },
    { socialLinks: [{ url: 'https://example.com', userId: 'other' }] },
    {
      socialLinks: [
        { url: 'https://example.com' },
        { url: 'https://example.com' },
      ],
    },
    { workIntervals: [{ weekday: 0, startMinute: 0, endMinute: 60 }] },
    { workIntervals: [{ weekday: 1, startMinute: '60', endMinute: 120 }] },
    { workIntervals: [{ weekday: 1, startMinute: 0, endMinute: 1441 }] },
  ])('rejects invalid or privileged fields: %j', async (body) => {
    await expect(profile(body)).rejects.toThrow();
  });
  it('accepts a full profile', async () => {
    await expect(
      profile({
        name: 'Ada',
        phone: '+79991234567',
        bio: 'Developer',
        githubUrl: 'https://github.com/octocat',
        timeZone: 'Europe/Moscow',
        avatarUrl: 'https://example.com/avatar.png',
        socialLinks: [{ label: 'Website', url: 'https://example.com' }],
        workIntervals: [{ weekday: 7, startMinute: 0, endMinute: 1440 }],
      }),
    ).resolves.toBeInstanceOf(UserProfileDto);
  });
  it('requires a new password of 12–128 characters and accepts an existing shorter password', async () => {
    await expect(
      pipe.transform(
        { password: 'legacy', newPassword: 'long-new-password' },
        { type: 'body', metatype: UserPasswordDto },
      ),
    ).resolves.toBeInstanceOf(UserPasswordDto);
    await expect(
      pipe.transform(
        { password: 'legacy', newPassword: 'short' },
        { type: 'body', metatype: UserPasswordDto },
      ),
    ).rejects.toThrow();
  });
});
