import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword, encrypt } from "@/lib/auth";
import { cookies } from "next/headers";
import * as peopleService from "./peopleService";
import * as friendsService from "./friendsService";

export async function register(name: string, email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing) {
    throw new Error("Email already exists");
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
    },
  });

  return createSession(user);
}

export async function login(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid email or password");
  }

  return createSession(user);
}

export async function createSession(user: any) {
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const session = await encrypt({
    userId: user.id,
    email: user.email,
    name: user.name,
    expires,
  });

  const cookieStore = await cookies();
  cookieStore.set("session", session, { 
    expires, 
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax"
  });

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      profileImageUrl: user.profileImageUrl,
    },
    token: session,
  };
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}

export async function getUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      dateOfBirth: true,
      profileImageUrl: true,
    },
  });
}

export async function updateProfile(userId: string, data: { name?: string; email?: string; dob?: string; profileImageUrl?: string }) {
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      name: data.name,
      email: data.email?.trim().toLowerCase(),
      dateOfBirth: data.dob,
      profileImageUrl: data.profileImageUrl,
    },
  });

  return createSession(updatedUser);
}

export async function changePassword(userId: string, oldPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || !(await verifyPassword(oldPassword, user.passwordHash))) {
    throw new Error("Invalid current password");
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  return { success: true };
}

export async function getSocialOverview(userId: string) {
  const [users, friends, incomingRequests, outgoingRequests] = await Promise.all([
    peopleService.discoverPeople(userId),
    friendsService.listFriends(userId),
    friendsService.listFriendRequests(userId, "incoming"),
    friendsService.listFriendRequests(userId, "outgoing"),
  ]);

  return { users, friends, incomingRequests, outgoingRequests };
}
