"use server";

import * as peopleService from "@/services/peopleService";
import { getSession } from "@/lib/auth";

export async function searchPeople(query: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return peopleService.searchPeople(session.userId, query);
}

export async function discoverPeople() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return peopleService.discoverPeople(session.userId);
}
