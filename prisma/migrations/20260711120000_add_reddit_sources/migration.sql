ALTER TYPE "SourceType" ADD VALUE 'REDDIT';

ALTER TABLE "Attachment" ADD COLUMN "externalUrl" TEXT;

CREATE TABLE "RedditSource" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "subreddit" TEXT NOT NULL,
    "sort" TEXT NOT NULL DEFAULT 'new',
    "minScore" INTEGER NOT NULL DEFAULT 0,
    "allowNsfw" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RedditSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RedditSource_sourceId_key" ON "RedditSource"("sourceId");

ALTER TABLE "RedditSource"
ADD CONSTRAINT "RedditSource_sourceId_fkey"
FOREIGN KEY ("sourceId") REFERENCES "Source"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
