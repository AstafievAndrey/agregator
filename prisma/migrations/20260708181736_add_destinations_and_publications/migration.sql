-- CreateEnum
CREATE TYPE "DestinationType" AS ENUM ('TELEGRAM');

-- CreateEnum
CREATE TYPE "DestinationStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PostPublicationStatus" AS ENUM ('PENDING', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PostStatus" ADD VALUE 'SENT_TO_MODERATION';
ALTER TYPE "PostStatus" ADD VALUE 'PUBLISHED';
ALTER TYPE "PostStatus" ADD VALUE 'REJECTED';

-- CreateTable
CREATE TABLE "Destination" (
    "id" TEXT NOT NULL,
    "type" "DestinationType" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "DestinationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostPublication" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "status" "PostPublicationStatus" NOT NULL DEFAULT 'PENDING',
    "externalPublicationId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostPublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDestination" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceDestination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramDestination" (
    "id" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelName" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramDestination_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostPublication_postId_destinationId_key" ON "PostPublication"("postId", "destinationId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDestination_sourceId_destinationId_key" ON "SourceDestination"("sourceId", "destinationId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramDestination_destinationId_key" ON "TelegramDestination"("destinationId");

-- AddForeignKey
ALTER TABLE "PostPublication" ADD CONSTRAINT "PostPublication_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostPublication" ADD CONSTRAINT "PostPublication_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDestination" ADD CONSTRAINT "SourceDestination_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDestination" ADD CONSTRAINT "SourceDestination_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramDestination" ADD CONSTRAINT "TelegramDestination_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;
