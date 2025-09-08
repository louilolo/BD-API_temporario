/*
  Warnings:

  - You are about to drop the column `orScheduledId` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `openremoteLinkedAt` on the `Room` table. All the data in the column will be lost.
  - You are about to drop the column `powerAttribute` on the `Room` table. All the data in the column will be lost.
  - You are about to drop the column `powerLeadMinutes` on the `Room` table. All the data in the column will be lost.
  - You are about to drop the column `timezone` on the `Room` table. All the data in the column will be lost.
  - You are about to drop the `DeviceSchedulePush` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."DeviceSchedulePush" DROP CONSTRAINT "DeviceSchedulePush_eventId_fkey";

-- DropForeignKey
ALTER TABLE "public"."DeviceSchedulePush" DROP CONSTRAINT "DeviceSchedulePush_roomId_fkey";

-- AlterTable
ALTER TABLE "public"."Event" DROP COLUMN "orScheduledId",
DROP COLUMN "updatedAt",
ADD COLUMN     "orScheduleId" TEXT;

-- AlterTable
ALTER TABLE "public"."Room" DROP COLUMN "openremoteLinkedAt",
DROP COLUMN "powerAttribute",
DROP COLUMN "powerLeadMinutes",
DROP COLUMN "timezone";

-- DropTable
DROP TABLE "public"."DeviceSchedulePush";

-- DropEnum
DROP TYPE "public"."PushStatus";
