/*
  Warnings:

  - Added the required column `title` to the `Event` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Event" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "orScheduledId" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Belem',
ADD COLUMN     "title" TEXT NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'confirmed';

-- AlterTable
ALTER TABLE "public"."Room" ADD COLUMN     "capacity" INTEGER,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "location" TEXT;

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "Event_roomId_startsAt_endsAt_idx" ON "public"."Event"("roomId", "startsAt", "endsAt");

-- AddForeignKey
ALTER TABLE "public"."Event" ADD CONSTRAINT "Event_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
