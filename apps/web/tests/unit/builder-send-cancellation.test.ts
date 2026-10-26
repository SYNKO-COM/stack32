import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  cancel: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/actions/builder", () => ({
  executeBuilderTurn: mocks.execute,
  executeBuilderRepair: vi.fn(),
  cancelBuilderRun: mocks.cancel,
}));
vi.mock("@/lib/chat/prepare-attachments", () => ({
  prepareChatAttachments: vi.fn(), signMessageAttachments: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  requireSupabaseBrowserClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) },
    rpc: mocks.rpc,
    from: (table: string) => {
      if (table === "builder_messages") return { insert: async () => ({ error: null }) };
      const query = {
        select: () => query, eq: () => query, order: () => query, limit: () => query,
        maybeSingle: async () => ({ data: { id: "thread" } }),
      };
      return query;
    },
  }),
}));

import { SupabaseBuilderRepository } from "@/lib/repositories/supabase/builder";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("Stop while the send is still creating its run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: { exhausted: false } });
    mocks.cancel.mockResolvedValue({ status: "canceled" });
  });

  it("does not dispatch a stopped turn after its asynchronous preparation", async () => {
    const credits = deferred<{ data: { exhausted: boolean } }>();
    mocks.rpc.mockReturnValueOnce(credits.promise);
    const controller = new AbortController();
    const pending = new SupabaseBuilderRepository().sendMessage("qa", "Question", [], "chat", "max", controller.signal);
    await vi.waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
    controller.abort();
    credits.resolve({ data: { exhausted: false } });
    await pending;
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("cancels the late-created exact run while preserving a newer turn", async () => {
    const created = deferred<{ runId: string }>();
    mocks.execute.mockReturnValueOnce(created.promise).mockResolvedValueOnce({ runId: "run-new" });
    const repository = new SupabaseBuilderRepository();
    const old = new AbortController();
    const pending = repository.sendMessage("qa", "Old question", [], "chat", "max", old.signal);
    await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(1));
    old.abort();
    await repository.sendMessage("qa", "New question", [], "chat", "standard", new AbortController().signal);
    created.resolve({ runId: "run-old" });
    await pending;
    expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith({ agentId: "qa", runId: "run-old" });
    expect(mocks.execute.mock.calls.map(([arg]) => arg.prompt)).toEqual(["Old question", "New question"]);
  });
});
