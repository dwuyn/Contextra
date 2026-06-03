import "server-only";

import { prisma } from "@/lib/prisma";

export async function searchPeople(userId: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const users = await prisma.user.findMany({
    where: {
      email: { contains: normalizedQuery, mode: "insensitive" },
      id: { not: userId },
    },
    take: 10,
    include: {
      friendships: {
        where: { friendId: userId },
      },
      friendOf: {
        where: { userId: userId },
      },
      receivedRequests: {
        where: { senderId: userId, status: "pending" },
      },
      sentRequests: {
        where: { receiverId: userId, status: "pending" },
      },
    },
  });

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    profileImageUrl: user.profileImageUrl,
    isFriend: user.friendships.length > 0 || user.friendOf.length > 0,
    hasPendingRequest: user.receivedRequests.length > 0 || user.sentRequests.length > 0,
  }));
}

export async function discoverPeople(userId: string) {
  const friends = await prisma.friendship.findMany({
    where: { OR: [{ userId }, { friendId: userId }] },
  });
  const friendIds = friends.map((f) => (f.userId === userId ? f.friendId : f.userId));

  const pendingRequests = await prisma.friendRequest.findMany({
    where: {
      OR: [{ senderId: userId }, { receiverId: userId }],
      status: "pending",
    },
  });
  const pendingIds = pendingRequests.map((r) => (r.senderId === userId ? r.receiverId : r.senderId));

  const excludeIds = [userId, ...friendIds, ...pendingIds];

  return prisma.user.findMany({
    where: {
      id: { notIn: excludeIds },
    },
    select: {
      id: true,
      name: true,
      email: true,
      profileImageUrl: true,
    },
    take: 6,
  });
}
