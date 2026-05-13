"use server";

import * as chatService from "@/services/chatService";
import { getSession } from "@/lib/auth";
import { sendEvent } from "@/lib/realtime";

export async function getDirectMessages(friendId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return chatService.getDirectMessages(session.userId, friendId);
}

export async function sendDirectMessage(receiverId: string, content: string, fileName?: string, fileUrl?: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const message = await chatService.sendDirectMessage(session.userId, receiverId, content, fileName, fileUrl);
  
  // Trigger real-time event
  sendEvent(receiverId, "new_message", message);
  
  return message;
}
