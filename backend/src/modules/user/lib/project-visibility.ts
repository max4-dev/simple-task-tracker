// Roles currently describe specialization only. Project membership grants full
// project access; the organization owner retains access to every project.
export function canViewProject(
  userId: string,
  ownerUserId: string,
  members: { userId: string }[],
): boolean {
  return (
    userId === ownerUserId || members.some((member) => member.userId === userId)
  );
}
