import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import EventEmitter from "eventemitter3";
import type {
  JsonRpcNotification,
  JsonRpcResponse,
  RequestId,
} from "./protocol";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export class JsonRpcProcessTransport extends EventEmitter<{
  notification: (notification: JsonRpcNotification) => void;
  exit: (code: number | null, signal: NodeJS.Signals | null) => void;
  stderr: (line: string) => void;
}> {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<RequestId, Pending>();

  constructor(
    private readonly command: string,
    private readonly args: string[],
    private readonly cwd?: string,
    private readonly env?: NodeJS.ProcessEnv,
  ) {
    super();
  }

  start(): void {
    if (this.proc) {
      return;
    }

    this.proc = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: this.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdout = readline.createInterface({ input: this.proc.stdout });
    stdout.on("line", (line) => this.handleLine(line));

    const stderr = readline.createInterface({ input: this.proc.stderr });
    stderr.on("line", (line) => this.emit("stderr", line));

    this.proc.on("exit", (code, signal) => {
      for (const pending of this.pending.values()) {
        pending.reject(
          new Error(
            `Codex app-server exited before responding (${code ?? signal ?? "unknown"}).`,
          ),
        );
      }
      this.pending.clear();
      this.proc = null;
      this.emit("exit", code, signal);
    });

    this.proc.on("error", (error) => {
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
      this.proc = null;
      this.emit("stderr", error.message);
    });
  }

  async request<T>(
    method: string,
    params?: unknown,
    timeoutMs = 8000,
  ): Promise<T> {
    if (!this.proc) {
      this.start();
    }

    const id = this.nextId++;
    const payload = JSON.stringify({ method, id, params });

    const promise = new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            `Timed out waiting for Codex app-server method '${method}'.`,
          ),
        );
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value as T);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
    });

    this.proc?.stdin.write(`${payload}\n`);
    return promise;
  }

  notify(method: string, params?: unknown): void {
    if (!this.proc) {
      this.start();
    }
    this.proc?.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  close(): void {
    this.proc?.kill();
    this.proc = null;
  }

  private handleLine(line: string): void {
    let message: JsonRpcResponse | JsonRpcNotification;
    try {
      message = JSON.parse(line) as JsonRpcResponse | JsonRpcNotification;
    } catch {
      return;
    }

    if ("id" in message) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);

      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    this.emit("notification", message);
  }
}

export class MockTransport extends EventEmitter<{
  notification: (notification: JsonRpcNotification) => void;
}> {
  public requests: Array<{ method: string; params?: unknown }> = [];

  constructor(
    private readonly handler: (
      method: string,
      params?: unknown,
    ) => unknown | Promise<unknown>,
  ) {
    super();
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    this.requests.push({ method, params });
    return (await this.handler(method, params)) as T;
  }

  notify(): void {
    // test transport intentionally ignores notifications
  }

  close(): void {
    // noop
  }
}
