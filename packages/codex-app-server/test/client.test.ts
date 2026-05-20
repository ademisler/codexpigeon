import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CodexAppServerClient,
  createCodexProcessEnv,
  JsonRpcProcessTransport,
  MockTransport,
  resolveCodexCommand,
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

  it("augments launchd-style PATH values for Codex lookup", () => {
    const env = createCodexProcessEnv({ PATH: "/usr/bin:/bin" });
    const entries = env.PATH?.split(path.delimiter) ?? [];

    expect(entries).toContain("/Applications/Codex.app/Contents/Resources");
    expect(entries).toContain("/opt/homebrew/bin");
    expect(entries).toContain("/usr/bin");
  });

  it("resolves codex from the provided executable path", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codexpigeon-codex-"));
    const executable = path.join(dir, "codex");
    fs.writeFileSync(executable, "#!/bin/sh\nexit 0\n");
    fs.chmodSync(executable, 0o755);

    expect(resolveCodexCommand(undefined, { PATH: dir })).toBe(executable);
  });
});
