-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_VolunteerProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "roleTags" TEXT NOT NULL DEFAULT '',
    "isCoordinator" BOOLEAN NOT NULL DEFAULT false,
    "fosterId" TEXT,
    "transportId" TEXT,
    "rescueId" TEXT,
    "invitedAt" DATETIME,
    "lastLoginAt" DATETIME,
    "disabledAt" DATETIME,
    "digestEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VolunteerProfile_fosterId_fkey" FOREIGN KEY ("fosterId") REFERENCES "Foster" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VolunteerProfile_transportId_fkey" FOREIGN KEY ("transportId") REFERENCES "TransportVolunteer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VolunteerProfile_rescueId_fkey" FOREIGN KEY ("rescueId") REFERENCES "RescueVolunteer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_VolunteerProfile" ("createdAt", "disabledAt", "email", "fosterId", "id", "invitedAt", "isCoordinator", "lastLoginAt", "name", "phone", "rescueId", "roleTags", "transportId", "updatedAt") SELECT "createdAt", "disabledAt", "email", "fosterId", "id", "invitedAt", "isCoordinator", "lastLoginAt", "name", "phone", "rescueId", "roleTags", "transportId", "updatedAt" FROM "VolunteerProfile";
DROP TABLE "VolunteerProfile";
ALTER TABLE "new_VolunteerProfile" RENAME TO "VolunteerProfile";
CREATE UNIQUE INDEX "VolunteerProfile_email_key" ON "VolunteerProfile"("email");
CREATE UNIQUE INDEX "VolunteerProfile_fosterId_key" ON "VolunteerProfile"("fosterId");
CREATE UNIQUE INDEX "VolunteerProfile_transportId_key" ON "VolunteerProfile"("transportId");
CREATE UNIQUE INDEX "VolunteerProfile_rescueId_key" ON "VolunteerProfile"("rescueId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
