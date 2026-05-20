import { describe, expect, it } from "vitest";
import {
  CodexAppServerClient,
  JsonRpcProcessTransport,
  MockTransport,
} from "../src";

describe("CodexAppServerClient", () => {
  it("uses only read-only App Server methods", async () => {
    const transport = new MockTransport((method) => {
      if (method === "initialize") {
        return {};
      }
      if (method === "thread/list") {
        return { data: [] };
      }
      if (method === "thread/loaded/list") {
        return { threadIds: [] };
      }
      return {};
    });
    const client = new CodexAppServerClient(transport, "mock");

    await expect(client.listThreads()).resolves.toEqual({ data: [] });
    await expect(client.listLoadedThreads()).resolves.toEqual({
      threadIds: [],
    });
    expect(transport.requests.map((request) => request.method)).toEqual([
      "initialize",
      "thread/list",
      "thread/loaded/list",
    ]);
  });

  it("rejects steering and mutation methods at runtime", async () => {
    const client = new CodexAppServerClient(
      new MockTransport(() => ({})),
      "mock",
    );
    await expect(client.request("turn/steer" as never, {})).rejects.toThrow(
      "read-only",
    );
    await expect(
      client.request("thread/inject_items" as never, {}),
    ).rejects.toThrow("read-only");
  });

  it("rejects promptly when the app-server process cannot start", async () => {
    const transport = new JsonRpcProcessTransport(
      "codexpigeon-definitely-missing-command",
      [],
    );

    await expect(transport.request("initialize", {}, 500)).rejects.toThrow();
    transport.close();
  });
});
