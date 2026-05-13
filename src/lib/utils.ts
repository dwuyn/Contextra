import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function tr(language: string, en: string, vi: string) {
  return language === "vi-VN" ? vi : en;
}
