import { FeedbackEntry } from "@/lib/types";

export interface FeedbackStore {
  getAll(): FeedbackEntry[];
  upsert(entry: FeedbackEntry): void;
}

const STORAGE_KEY = "correlation-feedback-v1";

export class LocalFeedbackStore implements FeedbackStore {
  getAll(): FeedbackEntry[] {
    if (typeof window === "undefined") return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as FeedbackEntry[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  upsert(entry: FeedbackEntry): void {
    if (typeof window === "undefined") return;
    const all = this.getAll();
    const existingIdx = all.findIndex((item) => item.sourceColumnId === entry.sourceColumnId);
    if (existingIdx >= 0) {
      all[existingIdx] = entry;
    } else {
      all.push(entry);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
}

// This abstraction is intentionally minimal so a DB-backed implementation can replace it later.
export function createFeedbackStore(): FeedbackStore {
  return new LocalFeedbackStore();
}
