import { prisma } from "@/lib/prisma";

export async function listFriends(userId: string) {
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [{ userId }, { friendId: userId }],
    },
    include: {
      user: true,
      friend: true,
    },
  });

  return friendships.map((f) => {
    const friend = f.userId === userId ? f.friend : f.user;
    return {
      id: friend.id,
      name: friend.name,
      email: friend.email,
      profileImageUrl: friend.profileImageUrl,
      createdAt: friend.createdAt.toISOString(),
    };
  });
}

export async function listFriendRequests(userId: string, mode: "incoming" | "outgoing") {
  const requests = await prisma.friendRequest.findMany({
    where: {
      status: "pending",
      ...(mode === "incoming" ? { receiverId: userId } : { senderId: userId }),
    },
    include: {
      sender: true,
      receiver: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return requests.map((r) => ({
    id: r.id,
    senderId: r.senderId,
    senderName: r.sender.name,
    senderEmail: r.sender.email,
    receiverId: r.receiverId,
    receiverName: r.receiver.name,
    receiverEmail: r.receiver.email,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function createFriendRequest(senderId: string, receiverUserId: string) {
  if (senderId === receiverUserId) throw new Error("Cannot add self");

  const existing = await prisma.friendRequest.findFirst({
    where: {
      OR: [
        { senderId, receiverId: receiverUserId },
        { senderId: receiverUserId, receiverId: senderId },
      ],
      status: "pending",
    },
  });

  if (existing) throw new Error("Request already pending");

  const request = await prisma.friendRequest.create({
    data: {
      senderId,
      receiverId: receiverUserId,
    },
  });

  return request;
}

export async function respondToFriendRequest(userId: string, requestId: string, action: "accepted" | "rejected") {
  return prisma.$transaction(async (tx) => {
    const request = await tx.friendRequest.findUnique({
      where: { id: requestId },
    });

    if (!request || request.receiverId !== userId) throw new Error("Request not found");

    const updatedRequest = await tx.friendRequest.update({
      where: { id: requestId },
      data: { status: action },
      include: {
        sender: true,
        receiver: true,
      }
    });

    if (action === "accepted") {
      const existingFriendship = await tx.friendship.findFirst({
        where: {
          OR: [
            { userId: request.senderId, friendId: request.receiverId },
            { userId: request.receiverId, friendId: request.senderId },
          ],
        },
      });

      if (!existingFriendship) {
        await tx.friendship.create({
          data: {
            userId: request.senderId,
            friendId: request.receiverId,
          },
        });
      }
    }

    return updatedRequest;
  });
}
