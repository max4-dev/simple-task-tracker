import { isWorkingNow, validateWorkIntervals } from './work-schedule.js';

describe('work schedule', () => {
  const monday = [{ weekday: 1, startMinute: 540, endMinute: 1080 }];
  it('uses local time and excludes the end boundary', () => {
    expect(
      isWorkingNow('Europe/Moscow', monday, new Date('2026-11-16T06:00:00Z')),
    ).toBe(true);
    expect(
      isWorkingNow('Europe/Moscow', monday, new Date('2026-11-16T15:00:00Z')),
    ).toBe(false);
    expect(isWorkingNow('UTC', monday, new Date('2026-11-16T06:00:00Z'))).toBe(
      false,
    );
  });
  it('handles day rollover and an empty schedule', () => {
    expect(
      isWorkingNow('Asia/Tokyo', monday, new Date('2026-11-16T23:00:00Z')),
    ).toBe(false);
    expect(isWorkingNow('UTC', [], new Date())).toBe(false);
  });
  it('honors daylight saving time rather than storing a UTC offset', () => {
    const sunday = [{ weekday: 7, startMinute: 90, endMinute: 120 }];
    expect(
      isWorkingNow(
        'America/New_York',
        sunday,
        new Date('2026-11-01T05:45:00Z'),
      ),
    ).toBe(true);
    expect(
      isWorkingNow(
        'America/New_York',
        sunday,
        new Date('2026-11-01T06:45:00Z'),
      ),
    ).toBe(true);
    expect(
      isWorkingNow(
        'America/New_York',
        sunday,
        new Date('2026-11-01T07:00:00Z'),
      ),
    ).toBe(false);
  });
  it.each([
    [{ weekday: 1, startMinute: 600, endMinute: 600 }],
    [{ weekday: 1, startMinute: 700, endMinute: 600 }],
    [...monday, { weekday: 1, startMinute: 600, endMinute: 700 }],
    [...monday, ...monday],
  ])(
    'rejects empty, overnight or overlapping intervals: %j',
    (...intervals) => {
      expect(() => validateWorkIntervals(intervals)).toThrow();
    },
  );
  it('allows adjacent intervals and shifts split at midnight', () => {
    expect(() =>
      validateWorkIntervals([
        { weekday: 1, startMinute: 1200, endMinute: 1440 },
        { weekday: 2, startMinute: 0, endMinute: 300 },
        { weekday: 2, startMinute: 300, endMinute: 400 },
      ]),
    ).not.toThrow();
  });
});
