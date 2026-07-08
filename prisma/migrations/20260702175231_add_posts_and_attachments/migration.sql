-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('PHOTO', 'VIDEO');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('PROCESSING', 'COLLECTED', 'ERROR', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "telegramFileId" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" BIGINT,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "postId" TEXT NOT NULL,
    "type" "AttachmentType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "text" TEXT,
    "externalId" TEXT NOT NULL,
    "status" "PostStatus" NOT NULL DEFAULT 'PROCESSING',
    "sourceId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_postId_position_key" ON "Attachment"("postId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Post_sourceId_externalId_key" ON "Post"("sourceId", "externalId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;
