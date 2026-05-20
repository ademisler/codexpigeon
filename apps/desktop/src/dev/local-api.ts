import fs from "node:fs/promises";
import path from "node:path";
import type { ViteDevServer } from "vite";
import {
  appendInboxMessage,
  createMessageAutomation,
  installCodexPigeonWorkspace,
  inspectCodexPigeonWorkspace,
  listMessageAutomations,
  previewAgentsUpdate,
  readMailboxSnapshot,
  runDueMessageAutomations,
  stopMessageAutomation,
  validateInboxMessage,
  type InboxMessageInput,
  type MessageAutomationInput,
} from "../../../../packages/mailbox-core/src/index";
import { createCodexPigeonInstallAssets } from "../../../../packages/hooks/src/index";
import {
  createCodexAppServerClient,
  readRecentCodexLogActivity,
  type CodexAppServerClient,
  type CodexLogActivity,
} from "../../../../packages/codex-app-server/src/index";

let codexClientPromise: Promise<CodexAppServerClient> | null = null;

const RECENT_RUNNING_WINDOW_SECONDS = 45;

async function getJsonBody(
  request: import("node:http").IncomingMessage,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(
  response: import("node:http").ServerResponse,
  statusCode: number,
  data: unknown,
): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(data));
}

function bodyAsRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === "object"
    ? (body as Record<string, unknown>)
    : {};
}

async function getCodexClient(): Promise<CodexAppServerClient> {
  if (!codexClientPromise) {
    codexClientPromise = createCodexAppServerClient();
  }
  return codexClientPromise;
}

function normalizeLoadedThreadIds(loaded: unknown): string[] {
  if (Array.isArray(loaded)) {
    return loaded.filter((item): item is string => typeof item === "string");
  }

  if (loaded && typeof loaded === "object") {
    const record = loaded as { data?: unknown; threadIds?: unknown };
    if (Array.isArray(record.data)) {
      return record.data.filter(
        (item): item is string => typeof item === "string",
      );
    }
    if (Array.isArray(record.threadIds)) {
      return record.threadIds.filter(
        (item): item is string => typeof item === "string",
      );
    }
  }

  return [];
}

function enrichThreadActivity<
  T extends {
    id: string;
    updatedAt: number;
    status: { type: string; activeFlags?: string[] };
  },
>(
  threads: T[],
  loadedThreadIds: string[],
  appServerMode: string,
  logActivity: Map<string, CodexLogActivity>,
): T[] {
  const nowSeconds = Date.now() / 1000;
  const loaded = new Set(loadedThreadIds);

  return threads.map((thread) => {
    const stream = logActivity.get(thread.id);
    const isExplicitlyActive = thread.status?.type === "active";
    const isLoaded = loaded.has(thread.id);
    const recentlyUpdated =
      nowSeconds - thread.updatedAt <= RECENT_RUNNING_WINDOW_SECONDS;
    const hasRecentStream = Boolean(stream);
    const shouldMarkActive =
      isExplicitlyActive || isLoaded || hasRecentStream || recentlyUpdated;

    return {
      ...thread,
      status: shouldMarkActive
        ? {
            type: "active",
            activeFlags: [
              ...(thread.status?.activeFlags ?? []),
              ...(isLoaded ? ["loaded"] : []),
              ...(hasRecentStream ? ["streamingLog"] : []),
              ...(recentlyUpdated && !isExplicitlyActive
                ? ["recentlyUpdated"]
                : []),
              ...(appServerMode === "stdio" ? ["stdioFallback"] : []),
            ],
          }
        : thread.status,
      activity: {
        kind: shouldMarkActive ? "running" : "idle",
        reason: hasRecentStream
          ? `Streaming ${Math.max(0, Math.round(nowSeconds - (stream?.lastSeenAt ?? nowSeconds)))}s ago`
          : isExplicitlyActive
            ? "Codex App Server reports active"
            : isLoaded
              ? "Thread is loaded in App Server"
              : recentlyUpdated
                ? `Updated within ${RECENT_RUNNING_WINDOW_SECONDS}s`
                : "No recent activity",
        lastSeenAt: stream?.lastSeenAt ?? thread.updatedAt,
        detectionMode: hasRecentStream
          ? `${appServerMode}+logs`
          : appServerMode,
      },
    };
  });
}

export function registerLocalApi(server: ViteDevServer): void {
  server.middlewares.use("/api", async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const pathname = url.pathname;
      const method = request.method ?? "GET";

      if (method === "GET" && pathname === "/health") {
        sendJson(response, 200, { ok: true, mode: "vite-local-api" });
        return;
      }

      if (method === "POST" && pathname === "/mailbox/snapshot") {
        const body = bodyAsRecord(await getJsonBody(request));
        sendJson(
          response,
          200,
          await readMailboxSnapshot(String(body.workspace ?? "")),
        );
        return;
      }

      if (method === "POST" && pathname === "/mailbox/validate") {
        const body = bodyAsRecord(await getJsonBody(request));
        sendJson(response, 200, validateInboxMessage(String(body.body ?? "")));
        return;
      }

      if (method === "POST" && pathname === "/mailbox/send") {
        const body = bodyAsRecord(await getJsonBody(request));
        sendJson(
          response,
          200,
          await appendInboxMessage(
            String(body.workspace ?? ""),
            body.input as InboxMessageInput,
            { allowWarnings: Boolean(body.allowWarnings) },
          ),
        );
        return;
      }

      if (method === "POST" && pathname === "/automations/list") {
        const body = bodyAsRecord(await getJsonBody(request));
        sendJson(
          response,
          200,
          await listMessageAutomations(String(body.workspace ?? "")),
        );
        return;
      }

      if (method === "POST" && pathname === "/automations/create") {
        const body = bodyAsRecord(await getJsonBody(request));
        sendJson(
          response,
          200,
          await createMessageAutomation(
            String(body.workspace ?? ""),
            body.input as MessageAutomationInput,
          ),
        );
        return;
      }

      if (method === "POST" && pathname === "/automations/stop") {
        const body = bodyAsRecord(await getJsonBody(request));
        sendJson(
          response,
          200,
          await stopMessageAutomation(
            String(body.workspace ?? ""),
            String(body.automationId ?? ""),
          ),
        );
        return;
      }

      if (method === "POST" && pathname === "/automations/run-due") {
        const body = bodyAsRecord(await getJsonBody(request));
        sendJson(response, 200, {
          sent: await runDueMessageAutomations(String(body.workspace ?? "")),
        });
        return;
      }

      if (method === "POST" && pathname === "/install/preview") {
        const body = bodyAsRecord(await getJsonBody(request));
        const workspace = String(body.workspace ?? "");
        const agentsPath = path.join(workspace, "AGENTS.md");
        const currentAgents = await fs
          .readFile(agentsPath, "utf8")
          .catch(() => "");
        sendJson(
          response,
          200,
          previewAgentsUpdate(
            currentAgents,
            createCodexPigeonInstallAssets().agentsSection,
          ),
        );
        return;
      }

      if (method === "POST" && pathname === "/install/status") {
        const body = bodyAsRecord(await getJsonBody(request));
        sendJson(
          response,
          200,
          await inspectCodexPigeonWorkspace(String(body.workspace ?? "")),
        );
        return;
      }

      if (method === "POST" && pathname === "/install/apply") {
        const body = bodyAsRecord(await getJsonBody(request));
        sendJson(
          response,
          200,
          await installCodexPigeonWorkspace(
            String(body.workspace ?? ""),
            createCodexPigeonInstallAssets(),
          ),
        );
        return;
      }

      if (method === "GET" && pathname === "/codex/threads") {
        try {
          const client = await getCodexClient();
          const [threads, loaded] = await Promise.all([
            client.listThreads({
              limit: 30,
              sortKey: "updated_at",
              sortDirection: "desc",
            }),
            client.listLoadedThreads().catch(() => ({ threadIds: [] })),
          ]);
          const loadedThreadIds = normalizeLoadedThreadIds(loaded);
          const logActivity = await readRecentCodexLogActivity({
            windowSeconds: RECENT_RUNNING_WINDOW_SECONDS,
          });
          sendJson(response, 200, {
            ok: true,
            mode: client.mode,
            threads: enrichThreadActivity(
              threads.data,
              loadedThreadIds,
              client.mode,
              logActivity,
            ),
            loadedThreadIds,
            detection: {
              mode: client.mode,
              recentRunningWindowSeconds: RECENT_RUNNING_WINDOW_SECONDS,
              liveProxyAvailable: client.mode === "proxy",
              logStreamingThreads: logActivity.size,
            },
          });
        } catch (error) {
          sendJson(response, 200, {
            ok: false,
            mode: "degraded",
            error: error instanceof Error ? error.message : String(error),
            threads: [],
            loadedThreadIds: [],
          });
        }
        return;
      }

      if (method === "POST" && pathname === "/codex/hooks") {
        const body = bodyAsRecord(await getJsonBody(request));
        try {
          const client = await getCodexClient();
          sendJson(response, 200, {
            ok: true,
            mode: client.mode,
            hooks: await client.listHooks([String(body.workspace ?? "")]),
          });
        } catch (error) {
          sendJson(response, 200, {
            ok: false,
            mode: "degraded",
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      sendJson(response, 404, {
        ok: false,
        error: `Unknown API route ${method} ${pathname}`,
      });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
