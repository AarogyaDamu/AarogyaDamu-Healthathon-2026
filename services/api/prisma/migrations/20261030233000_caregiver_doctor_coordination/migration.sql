-- AlterTable
ALTER TABLE "CareTask" ADD COLUMN "completedById" TEXT;
ALTER TABLE "CareTask" ADD COLUMN "completedByRole" TEXT;

-- CreateTable
CREATE TABLE "CareTeamMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT,
    "senderRole" TEXT NOT NULL DEFAULT 'PATIENT',
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "content" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CareTeamMessage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CareTeamMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CareTeamMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CareNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "patientId" TEXT,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CareNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CareTask_completedById_idx" ON "CareTask"("completedById");

-- CreateIndex
CREATE INDEX "CareTeamMessage_patientId_createdAt_idx" ON "CareTeamMessage"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "CareTeamMessage_senderId_idx" ON "CareTeamMessage"("senderId");

-- CreateIndex
CREATE INDEX "CareTeamMessage_recipientId_isRead_idx" ON "CareTeamMessage"("recipientId", "isRead");

-- CreateIndex
CREATE INDEX "CareNotification_userId_isRead_createdAt_idx" ON "CareNotification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "CareNotification_patientId_idx" ON "CareNotification"("patientId");
