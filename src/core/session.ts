// 会话持久化：.clover/sessions/<id>.json，支持恢复

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { ChatMessage, SessionRecord } from "../types.js";
import { readJsonFile, writeJsonFile } from "../utils/config.js";

const SESSIONS_DIR = path.join(".clover", "sessions");

export function createSession(): SessionRecord {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    startedAt: now,
    updatedAt: now,
    messages: [],
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 0,
  };
}

export function saveSession(session: SessionRecord): void {
  writeJsonFile(path.join(SESSIONS_DIR, session.id + ".json"), session);
}

export function loadSession(id: string): SessionRecord | null {
  return readJsonFile<SessionRecord>(path.join(SESSIONS_DIR, id + ".json"));
}

export function listSessions(): SessionRecord[] {
  if (!fs.existsSync(SESSIONS_DIR)) return [];
  return fs
    .readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJsonFile<SessionRecord>(path.join(SESSIONS_DIR, f)))
    .filter((s): s is SessionRecord => s !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function latestSession(): SessionRecord | null {
  return listSessions()[0] ?? null;
}

export function appendMessage(session: SessionRecord, message: ChatMessage): void {
  session.messages.push(message);
  session.updatedAt = new Date().toISOString();
}

