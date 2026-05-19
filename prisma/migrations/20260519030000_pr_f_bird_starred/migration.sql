-- PR F: Bird.starred — Christina's "fully sorted" tappable star on bird cards.
--
-- Hand-authored 2026-05-18. Same discipline as PR C v2 / PR D:
-- additive only. ONE column add, no table redefines, no unrelated
-- drift cleanups. Bird table left alone except for this column.
--
-- SQLite stores Boolean as INTEGER. Existing Prisma client tolerates
-- both INTEGER 0/1 and BOOLEAN cols (we've been mixing them since
-- the very first migration), so this stays consistent with the rest
-- of the Bird table (other boolean cols are INTEGER NOT NULL DEFAULT 0).

ALTER TABLE "Bird" ADD COLUMN "starred" INTEGER NOT NULL DEFAULT 0;
