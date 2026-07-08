-- CreateEnum
CREATE TYPE "PostModerationStatus" AS ENUM ('PENDING', 'SENT', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "PostModeration" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "status" "PostModerationStatus" NOT NULL DEFAULT 'PENDING',
    "draftText" TEXT,
    "draftMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "moderatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostModeration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostModeration_postId_key" ON "PostModeration"("postId");

-- AddForeignKey
ALTER TABLE "PostModeration" ADD CONSTRAINT "PostModeration_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
