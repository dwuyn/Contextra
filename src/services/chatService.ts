import "server-only";

import { prisma } from "@/lib/prisma";

export async function getDirectMessages(userId: string, friendId: string, cursor?: string, take = 100) {
  return prisma.directMessage.findMany({
    where: {
      OR: [
        { senderId: userId, receiverId: friendId },
        { senderId: friendId, receiverId: userId },
      ],
    },
    orderBy: { createdAt: "asc" },
    take,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });
}

export async function requireFriendship(userId: string, friendId: string) {
  const friendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userId, friendId },
        { userId: friendId, friendId: userId },
      ],
    },
  });

  if (!friendship) throw new Error("You can only message friends");
  return friendship;
}

export async function sendDirectMessage(senderId: string, receiverId: string, content: string, fileName?: string, fileUrl?: string) {
  await requireFriendship(senderId, receiverId);

  return prisma.directMessage.create({
    data: {
      senderId,
      receiverId,
      content,
      fileName,
      fileUrl,
    },
  });
}
