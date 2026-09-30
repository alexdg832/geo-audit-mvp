import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  supportThread: { update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  supportMessage: { count: vi.fn(), create: vi.fn() },
}));
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn(), isAdmin: vi.fn() }));
const notify = vi.hoisted(() => ({ notifySupportMessageFromClient: vi.fn(), notifySupportReplyFromAdmin: vi.fn() }));
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/auth/session", () => session);
vi.mock("@/lib/email/notify", () => notify);
vi.mock("@/lib/notifications", () => ({ notifyBusinessUsers: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => void task() }));

import { adminReplyToThreadAction, replyToSupportThreadAction, setSupportThreadStatusAction } from "./support";

const USER = { id: "u1", email: "owner@acme.test", businessId: "b1" };

function form(message: string): FormData {
  const fd = new FormData();
  fd.set("message", message);
  return fd;
}

function notFoundError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Record to update not found.", { code: "P2025", clientVersion: "test" });
}

beforeEach(() => {
  vi.clearAllMocks();
  session.getCurrentUser.mockResolvedValue(USER);
  session.isAdmin.mockResolvedValue(true);
  prisma.supportMessage.count.mockResolvedValue(0);
  prisma.supportThread.update.mockResolvedValue({ messages: [{ id: "m1" }] });
});

describe("replyToSupportThreadAction", () => {
  it("inserts the message and reopens the thread in a single tenant-scoped write", async () => {
    const result = await replyToSupportThreadAction("t1", {}, form("Still wrong"));

    expect(result).toEqual({ success: "Reply sent.", nonce: expect.any(Number) });
    expect(prisma.supportMessage.create).not.toHaveBeenCalled();
    expect(prisma.supportThread.update).toHaveBeenCalledTimes(1);
    const call = prisma.supportThread.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: "t1", businessId: "b1" });
    expect(call.data.status).toBe("open");
    expect(call.data.messages.create).toMatchObject({ author: "client", authorName: "owner@acme.test", body: "Still wrong" });
    // The thread's lastMessageAt and the message's createdAt are the same instant, so ordering can never disagree.
    expect(call.data.messages.create.createdAt).toBe(call.data.lastMessageAt);
    expect(notify.notifySupportMessageFromClient).toHaveBeenCalledWith("m1", false);
  });

  it("reports a missing (or foreign) thread instead of throwing", async () => {
    prisma.supportThread.update.mockRejectedValueOnce(notFoundError());
    await expect(replyToSupportThreadAction("t-other", {}, form("Hi"))).resolves.toEqual({ error: "Conversation not found." });
    expect(notify.notifySupportMessageFromClient).not.toHaveBeenCalled();
  });

  it("still surfaces unexpected database errors", async () => {
    prisma.supportThread.update.mockRejectedValueOnce(new Error("connection reset"));
    await expect(replyToSupportThreadAction("t1", {}, form("Hi"))).rejects.toThrow("connection reset");
  });
});

describe("adminReplyToThreadAction", () => {
  it("inserts the reply and marks the thread answered in one write", async () => {
    prisma.supportThread.findUnique.mockResolvedValue({ id: "t1", businessId: "b1", subject: "Hours" });
    const result = await adminReplyToThreadAction("t1", {}, form("Fixed it."));

    expect(result).toEqual({ success: "Reply sent to the client.", nonce: expect.any(Number) });
    expect(prisma.supportMessage.create).not.toHaveBeenCalled();
    const call = prisma.supportThread.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: "t1" });
    expect(call.data.status).toBe("answered");
    expect(call.data.messages.create).toMatchObject({ author: "admin", body: "Fixed it." });
    expect(notify.notifySupportReplyFromAdmin).toHaveBeenCalledWith("m1");
  });

  it("reports a thread deleted between the lookup and the write", async () => {
    prisma.supportThread.findUnique.mockResolvedValue({ id: "t1", businessId: "b1", subject: "Hours" });
    prisma.supportThread.update.mockRejectedValueOnce(notFoundError());
    await expect(adminReplyToThreadAction("t1", {}, form("Fixed it."))).resolves.toEqual({ error: "Conversation not found." });
  });
});

describe("setSupportThreadStatusAction", () => {
  it("is a no-op for a thread that no longer exists", async () => {
    prisma.supportThread.updateMany.mockResolvedValue({ count: 0 });
    await expect(setSupportThreadStatusAction("gone", "closed")).resolves.toBeUndefined();
    expect(prisma.supportThread.updateMany).toHaveBeenCalledWith({ where: { id: "gone" }, data: { status: "closed" } });
    expect(prisma.supportThread.update).not.toHaveBeenCalled();
  });

  it("rejects unknown statuses without touching the database", async () => {
    await setSupportThreadStatusAction("t1", "archived");
    expect(prisma.supportThread.updateMany).not.toHaveBeenCalled();
  });
});
