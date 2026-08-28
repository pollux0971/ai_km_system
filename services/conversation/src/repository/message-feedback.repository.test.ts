import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import {
  extractCitationIds,
  setCitationFeedback,
  setFeedbackComment,
  setFeedbackReason,
  setFeedbackVerdict,
} from "./message-feedback.repository.js";
import { createMessage } from "./messages.repository.js";
import { toOwnerKey } from "./owner-scope.js";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.exec(`
    create table conversations (
      id text primary key, owner_key text not null, title text not null, mode text not null,
      knowledge_scopes text not null default '[]', model text not null, archived integer not null default 0,
      last_message_at text not null, last_message_preview text not null, created_at text not null, updated_at text not null
    );
    create table messages (
      id text primary key, conversation_id text not null references conversations(id) on delete cascade,
      owner_key text not null, role text not null, content text not null, attachment_names text not null default '[]',
      state text, revisions text, feedback text, feedback_reason text, feedback_comment text, citation_feedback text,
      created_at text not null, updated_at text not null
    );
  `);
  db.prepare(
    `insert into conversations (id, owner_key, title, mode, knowledge_scopes, model, archived, last_message_at, last_message_preview, created_at, updated_at)
     values ('c1', ?, '新對話', 'normal', '[]', 'standard', 0, ?, '尚無訊息。', ?, ?)`,
  ).run(OWNER, AT, AT, AT);
});

afterEach(() => db.close());

const OWNER = toOwnerKey("owner-1");
const AT = "2026-08-28T05:00:00.000Z";

function seedAssistantMessage(content = "答案。[1][2]") {
  return createMessage(db, OWNER, "c1", {
    id: "m1",
    role: "assistant",
    content,
    attachmentNames: [],
    now: AT,
  });
}

describe("extractCitationIds", () => {
  it("extracts every distinct [N] marker", () => {
    expect(extractCitationIds("答案。[1] 更多 [2] 重複 [1]")).toEqual(new Set(["1", "2"]));
  });

  it("returns an empty set when there are no markers", () => {
    expect(extractCitationIds("沒有引用的答案")).toEqual(new Set());
  });
});

describe("setFeedbackVerdict (AC1)", () => {
  it("upserts OK then NG, ending on NG", () => {
    seedAssistantMessage();
    setFeedbackVerdict(db, OWNER, "m1", "OK", AT);
    const final = setFeedbackVerdict(db, OWNER, "m1", "NG", "2026-08-28T06:00:00.000Z");
    expect(final.feedback).toBe("NG");
  });
});

describe("setFeedbackReason (AC2)", () => {
  it("persists the reason", () => {
    seedAssistantMessage();
    setFeedbackVerdict(db, OWNER, "m1", "NG", AT);
    const updated = setFeedbackReason(db, OWNER, "m1", "INCOMPLETE", AT);
    expect(updated.feedbackReason).toBe("INCOMPLETE");
  });
});

describe("setFeedbackComment (AC3)", () => {
  it("persists the trimmed comment", () => {
    seedAssistantMessage();
    setFeedbackVerdict(db, OWNER, "m1", "OK", AT);
    const updated = setFeedbackComment(db, OWNER, "m1", "很有幫助", AT);
    expect(updated.feedbackComment).toBe("很有幫助");
  });
});

describe("setCitationFeedback (AC4, AC7)", () => {
  it("scopes to only the targeted citationId, leaving others untouched", () => {
    seedAssistantMessage();
    setCitationFeedback(db, OWNER, "m1", "1", "OK", AT);
    const updated = setCitationFeedback(db, OWNER, "m1", "2", "NG", AT);
    expect(updated.citationFeedback).toEqual({ "1": "OK", "2": "NG" });
  });

  it("AC7: all 4 feedback dimensions coexist without overwriting each other", () => {
    seedAssistantMessage();
    setFeedbackVerdict(db, OWNER, "m1", "NG", AT);
    setFeedbackReason(db, OWNER, "m1", "INCOMPLETE", AT);
    setFeedbackComment(db, OWNER, "m1", "留言", AT);
    const final = setCitationFeedback(db, OWNER, "m1", "1", "OK", AT);
    expect(final.feedback).toBe("NG");
    expect(final.feedbackReason).toBe("INCOMPLETE");
    expect(final.feedbackComment).toBe("留言");
    expect(final.citationFeedback).toEqual({ "1": "OK" });
  });

  it("is scoped to the owner — cannot be called across owners", () => {
    seedAssistantMessage();
    const other = toOwnerKey("owner-2");
    expect(() => setCitationFeedback(db, other, "m1", "1", "OK", AT)).toThrow();
  });
});
