import EventEmitter from "eventemitter3";
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
  transport?: Transport;
  mode?: CodexAppServerMode;
};

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

  const proxy = new JsonRpcProcessTransport("codex", ["app-server", "proxy"], options.cwd);
  const proxyClient = new CodexAppServerClient(proxy, "proxy");
  try {
    await proxyClient.initialize();
    return proxyClient;
  } catch {
    proxyClient.close();
  }

  const stdio = new JsonRpcProcessTransport("codex", ["app-server"], options.cwd);
  const stdioClient = new CodexAppServerClient(stdio, "stdio");
  await stdioClient.initialize();
  return stdioClient;
}
