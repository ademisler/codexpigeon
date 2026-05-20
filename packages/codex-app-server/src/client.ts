import EventEmitter from "eventemitter3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonRpcProcessTransport } from "./json-rpc";
import {
  assertReadOnlyMethod,
  type HooksListResponse,
  type InitializeResponse,
  type JsonRpcNotification,
  type ReadOnlyCodexMethod,
  type ThreadListParams,
  type ThreadListResponse,
  type ThreadLoadedListResponse,
  type ThreadReadResponse
} from "./protocol";

type Transport = {
  request<T>(method: string, params?: unknown, timeoutMs?: number): Promise<T>;
  notify(method: string, params?: unknown): void;
  close(): void;
  on?(event: "notification", listener: (notification: JsonRpcNotification) => void): unknown;
};

export type CodexAppServerMode = "proxy" | "stdio" | "mock";

export type CodexAppServerClientOptions = {
  cwd?: string;
  codexCommand?: string;
  transport?: Transport;
  mode?: CodexAppServerMode;
};

const DEFAULT_EXECUTABLE_PATHS = [
  ".local/bin",
  "/Applications/Codex.app/Contents/Resources",
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
];

function stableExecutablePaths(): string[] {
  const home = os.homedir();
  return DEFAULT_EXECUTABLE_PATHS.map((entry) =>
    entry.startsWith(".") ? path.join(home, entry) : entry,
  );
}

function pathEntries(value: string | undefined): string[] {
  return (value ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function dedupePaths(entries: string[]): string[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry)) {
      return false;
    }
    seen.add(entry);
    return true;
  });
}

function canExecute(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function createCodexProcessEnv(
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const searchPath = dedupePaths([
    ...stableExecutablePaths(),
    ...pathEntries(baseEnv.PATH),
  ]).join(path.delimiter);

  return {
    ...baseEnv,
    PATH: searchPath,
  };
}

export function resolveCodexCommand(
  command: string | undefined = undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const commandName = command || env.CODEXPIGEON_CODEX_BIN || "codex";

  if (commandName.includes("/") || commandName.includes("\\")) {
    return commandName;
  }

  const searchPaths = dedupePaths([
    ...pathEntries(env.PATH),
    ...stableExecutablePaths(),
  ]);

  for (const dir of searchPaths) {
    const candidate = path.join(dir, commandName);
    if (canExecute(candidate)) {
      return candidate;
    }
  }

  return commandName;
}

export class CodexAppServerClient extends EventEmitter<{
  notification: (notification: JsonRpcNotification) => void;
}> {
  public readonly mode: CodexAppServerMode;
  private initialized = false;

  constructor(private readonly transport: Transport, mode: CodexAppServerMode) {
    super();
    this.mode = mode;
    this.transport.on?.("notification", (notification) => this.emit("notification", notification));
  }

  async initialize(): Promise<InitializeResponse> {
    if (this.initialized) {
      return {};
    }

    const response = await this.request<InitializeResponse>("initialize", {
      clientInfo: {
        name: "codexpigeon",
        title: "CodexPigeon",
        version: "0.1.0"
      },
      capabilities: {
        experimentalApi: true
      }
    });
    this.transport.notify("initialized", {});
    this.initialized = true;
    return response;
  }

  async listThreads(params: ThreadListParams = {}): Promise<ThreadListResponse> {
    await this.initialize();
    return this.request<ThreadListResponse>("thread/list", params);
  }

  async readThread(threadId: string, includeTurns = false): Promise<ThreadReadResponse> {
    await this.initialize();
    return this.request<ThreadReadResponse>("thread/read", { threadId, includeTurns });
  }

  async listLoadedThreads(): Promise<ThreadLoadedListResponse> {
    await this.initialize();
    return this.request<ThreadLoadedListResponse>("thread/loaded/list", {});
  }

  async listHooks(cwds: string[] = []): Promise<HooksListResponse> {
    await this.initialize();
    return this.request<HooksListResponse>("hooks/list", { cwds });
  }

  async request<T>(method: ReadOnlyCodexMethod, params?: unknown): Promise<T> {
    assertReadOnlyMethod(method);
    return this.transport.request<T>(method, params);
  }

  close(): void {
    this.transport.close();
  }
}

export async function createCodexAppServerClient(
  options: CodexAppServerClientOptions = {}
): Promise<CodexAppServerClient> {
  if (options.transport) {
    return new CodexAppServerClient(options.transport, options.mode ?? "mock");
  }

  const env = createCodexProcessEnv();
  const codexCommand = resolveCodexCommand(options.codexCommand, env);

  const proxy = new JsonRpcProcessTransport(
    codexCommand,
    ["app-server", "proxy"],
    options.cwd,
    env,
  );
  const proxyClient = new CodexAppServerClient(proxy, "proxy");
  try {
    await proxyClient.initialize();
    return proxyClient;
  } catch {
    proxyClient.close();
  }

  const stdio = new JsonRpcProcessTransport(
    codexCommand,
    ["app-server"],
    options.cwd,
    env,
  );
  const stdioClient = new CodexAppServerClient(stdio, "stdio");
  await stdioClient.initialize();
  return stdioClient;
}
