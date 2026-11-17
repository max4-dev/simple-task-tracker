import { BadRequestException } from '@nestjs/common';
import type { WorkIntervalDto } from '../dto/user.dto.js';

export function validateWorkIntervals(intervals: WorkIntervalDto[]): void {
  const ordered = [...intervals].sort(
    (a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute,
  );
  for (let index = 0; index < ordered.length; index++) {
    const current = ordered[index];
    const previous = ordered[index - 1];
    if (
      current.startMinute >= current.endMinute ||
      (previous?.weekday === current.weekday &&
        previous.endMinute > current.startMinute)
    ) {
      throw new BadRequestException(
        'Рабочие интервалы не должны пересекаться; начало должно быть раньше конца',
      );
    }
  }
}

export function isWorkingNow(
  timeZone: string,
  intervals: WorkIntervalDto[],
  now = new Date(),
): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((value) => value.type === type)?.value;
  const weekday =
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(part('weekday')) +
    1;
  const minute = Number(part('hour')) * 60 + Number(part('minute'));
  return intervals.some(
    (interval) =>
      interval.weekday === weekday &&
      interval.startMinute <= minute &&
      minute < interval.endMinute,
  );
}
