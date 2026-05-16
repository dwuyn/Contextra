"use server";

import * as friendsService from "@/services/friendsService";
import { getSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { sendEvent } from "@/lib/realtime";

export async function getFriends() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return friendsService.listFriends(session.userId);
}

export async function getFriendRequests(mode: "incoming" | "outgoing") {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return friendsService.listFriendRequests(session.userId, mode);
}

export async function sendFriendRequest(receiverUserId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const result = await friendsService.createFriendRequest(session.userId, receiverUserId);
  
  // Notify receiver
  sendEvent(receiverUserId, "new_friend_request", {
    id: result.id,
    senderId: session.userId,
    senderName: session.name,
  });
  
  revalidatePath("/");
  return result;
}

export async function respondToFriendRequest(requestId: string, action: "accepted" | "rejected") {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const result = await friendsService.respondToFriendRequest(session.userId, requestId, action);
  
  // If accepted or rejected, notify the sender so they can remove it from their outgoing list
  sendEvent(result.senderId, "friend_request_status_update", {
    id: requestId,
    status: action,
    receiverId: session.userId,
    receiverName: session.name,
  });
  
  revalidatePath("/");
  return result;
}
