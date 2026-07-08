/*
  Warnings:

  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('TELEGRAM');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR', 'ARCHIVED');

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramSource" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "channelName" TEXT,
    "telegramId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramSource_sourceId_key" ON "TelegramSource"("sourceId");

-- AddForeignKey
ALTER TABLE "TelegramSource" ADD CONSTRAINT "TelegramSource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;
