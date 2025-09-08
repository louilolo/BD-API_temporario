/*
  Warnings:

  - You are about to drop the column `createdAt` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `createdById` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `orScheduleId` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `timezone` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `capacity` on the `Room` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Room` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `Room` table. All the data in the column will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `updatedAt` to the `Event` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."PushStatus" AS ENUM ('PENDING', 'SENT', 'ACK', 'FAILED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "public"."Event" DROP CONSTRAINT "Event_createdById_fkey";

-- DropIndex
DROP INDEX "public"."Event_roomId_startsAt_endsAt_idx";

-- AlterTable
ALTER TABLE "public"."Event" DROP COLUMN "createdAt",
DROP COLUMN "createdById",
DROP COLUMN "description",
DROP COLUMN "orScheduleId",
DROP COLUMN "timezone",
DROP COLUMN "title",
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "status" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."Room" DROP COLUMN "capacity",
DROP COLUMN "createdAt",
DROP COLUMN "location",
ADD COLUMN     "openremoteLinkedAt" TIMESTAMP(3),
ADD COLUMN     "powerAttribute" TEXT NOT NULL DEFAULT 'power',
ADD COLUMN     "powerLeadMinutes" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Belem';

-- DropTable
DROP TABLE "public"."User";

-- CreateTable
CREATE TABLE "public"."DeviceSchedulePush" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "status" "public"."PushStatus" NOT NULL DEFAULT 'PENDING',
    "payloadHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "pushedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceSchedulePush_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceSchedulePush_eventId_key" ON "public"."DeviceSchedulePush"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceSchedulePush_scheduleId_key" ON "public"."DeviceSchedulePush"("scheduleId");

-- AddForeignKey
ALTER TABLE "public"."DeviceSchedulePush" ADD CONSTRAINT "DeviceSchedulePush_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeviceSchedulePush" ADD CONSTRAINT "DeviceSchedulePush_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "public"."Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
