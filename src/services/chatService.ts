import { prisma } from "@/lib/prisma";

export async function getDirectMessages(userId: string, friendId: string) {
  return prisma.directMessage.findMany({
    where: {
      OR: [
        { senderId: userId, receiverId: friendId },
        { senderId: friendId, receiverId: userId },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function sendDirectMessage(senderId: string, receiverId: string, content: string, fileName?: string, fileUrl?: string) {
  // Verify they are friends
  const friendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userId: senderId, friendId: receiverId },
        { userId: receiverId, friendId: senderId },
      ],
    },
  });

  if (!friendship) throw new Error("You can only message friends");

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
