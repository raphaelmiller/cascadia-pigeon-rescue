// Shared "active record" filters so we never accidentally show archived
// or soft-deleted birds/fosters in the operational views.
//
// Soft-delete pattern:
//   - archivedAt: set when user archives (hide from active lists, restorable)
//   - deletedAt:  set when user soft-deletes (only shown on /archive, restorable)
// Permanent delete = actual prisma.delete; happens only from /archive.

export const activeBirdWhere = {
  archivedAt: null,
  deletedAt: null,
};

export const activeFosterWhere = {
  archivedAt: null,
  deletedAt: null,
};
