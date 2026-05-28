"use server";

import * as authService from "@/services/authService";
import { getSession } from "@/lib/auth";

export type LoginActionResult =
  | { ok: true }
  | { ok: false; message: string };

export async function register(name: string, email: string, password: string): Promise<LoginActionResult> {
  try {
    await authService.register(name, email, password);
    return { ok: true };
  } catch (error) {
    if (error instanceof Error) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

export async function login(email: string, password: string): Promise<LoginActionResult> {
  try {
    await authService.login(email, password);
    return { ok: true };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === authService.INVALID_LOGIN_MESSAGE
    ) {
      return {
        ok: false,
        message: authService.INVALID_LOGIN_MESSAGE,
      };
    }

    throw error;
  }
}

export async function logout() {
  return authService.logout();
}

export async function getUser() {
  const session = await getSession();
  if (!session) return null;
  return authService.getUser(session.userId);
}

export async function updateProfile(data: { name?: string; dob?: string; profileImageUrl?: string }) {
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
