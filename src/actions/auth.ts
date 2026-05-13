"use server";

import * as authService from "@/services/authService";
import { getSession } from "@/lib/auth";

export async function register(name: string, email: string, password: string) {
  return authService.register(name, email, password);
}

export async function login(email: string, password: string) {
  return authService.login(email, password);
}

export async function logout() {
  return authService.logout();
}

export async function getUser() {
  const session = await getSession();
  if (!session) return null;
  return authService.getUser(session.userId);
}

export async function updateProfile(data: { name?: string; email?: string; dob?: string; profileImageUrl?: string }) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return authService.updateProfile(session.userId, data);
}

export async function changePassword(oldPassword: string, newPassword: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return authService.changePassword(session.userId, oldPassword, newPassword);
}

export async function getSocialOverview() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return authService.getSocialOverview(session.userId);
}
