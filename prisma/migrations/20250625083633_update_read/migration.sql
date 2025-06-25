/*
  Warnings:

  - A unique constraint covering the columns `[userId,postId]` on the table `reads` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "reads_userId_postId_key" ON "reads"("userId", "postId");
