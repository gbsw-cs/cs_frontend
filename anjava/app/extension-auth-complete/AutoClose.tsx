"use client";
import { useEffect } from "react";

export function AutoClose({ delayMs }: { delayMs: number }) {
  useEffect(() => {
    const id = setTimeout(() => window.close(), delayMs);
    return () => clearTimeout(id);
  }, [delayMs]);
  return null;
}
