import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type OpenDialogOptions,
} from "electron";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs/promises";
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
  watchMailbox,
  type InboxMessageInput,
  type MessageAutomationInput,
} from "@codexpigeon/mailbox-core";
import { createCodexPigeonInstallAssets } from "@codexpigeon/hooks";
import {
  createCodexAppServerClient,
  readRecentCodexLogActivity,
  type CodexAppServerClient,
  type CodexLogActivity,
} from "@codexpigeon/codex-app-server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let stopMailboxWatch: (() => Promise<void>) | null = null;
let automationTimer: NodeJS.Timeout | null = null;
let codexClientPromise: Promise<CodexAppServerClient> | null = null;

const RECENT_RUNNING_WINDOW_SECONDS = 45;

function rendererUrl(): string {
  if (process.env.VITE_DEV_SERVER_URL) {
    return process.env.VITE_DEV_SERVER_URL;
  }
  return pathToFileURL(
    path.join(__dirname, "../../renderer/index.html"),
  ).toString();
}

async function getCodexClient(): Promise<CodexAppServerClient> {
  if (!codexClientPromise) {
    codexClientPromise = createCodexAppServerClient();
    const client = await codexClientPromise;
    client.on("notification", (notification) => {
      mainWindow?.webContents.send("codex:notification", notification);
    });
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

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    title: "CodexPigeon",
    icon: path.join(__dirname, "../../../assets/codexpigeon.png"),
    backgroundColor: "#141414",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, code, description, url) => {
      console.error(
        `[codexpigeon] renderer failed to load ${url}: ${code} ${description}`,
      );
    },
  );

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[codexpigeon] renderer process gone: ${details.reason}`);
  });

  mainWindow.webContents.on("did-finish-load", () => {
    void mainWindow?.webContents
      .executeJavaScript("Boolean(window.codexpigeon)", true)
      .then((hasDesktopApi) => {
        console.log(
          `[codexpigeon] renderer ready (${hasDesktopApi ? "desktop-api" : "browser-fallback"})`,
        );
      })
      .catch((error: unknown) => {
        console.error(
          `[codexpigeon] desktop API check failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  });

  void mainWindow.loadURL(rendererUrl());
}

function stopAutomationRunner(): void {
  if (automationTimer) {
    clearInterval(automationTimer);
    automationTimer = null;
  }
}

function startAutomationRunner(workspace: string): void {
  stopAutomationRunner();
  automationTimer = setInterval(() => {
    void runDueMessageAutomations(workspace)
      .then(async (sent) => {
        if (sent.length === 0) {
          return;
        }
        const snapshot = await readMailboxSnapshot(workspace);
        mainWindow?.webContents.send("mailbox:snapshot", snapshot);
        mainWindow?.webContents.send(
          "automation:changed",
          snapshot.automations,
        );
      })
      .catch((error: unknown) => {
        mainWindow?.webContents.send("automation:error", {
          message: error instanceof Error ? error.message : String(error),
        });
      });
  }, 2_000);
}

ipcMain.handle("workspace:select", async () => {
  const options: OpenDialogOptions = {
    title: "Select Codex repo or worktree",
    properties: ["openDirectory", "createDirectory"],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? null : (result.filePaths[0] ?? null);
});

ipcMain.handle("mailbox:snapshot", async (_event, workspace: string) => {
  return readMailboxSnapshot(workspace);
});

ipcMain.handle("mailbox:validate", (_event, body: string) => {
  return validateInboxMessage(body);
});

ipcMain.handle(
  "mailbox:send",
  async (
    _event,
    workspace: string,
    input: InboxMessageInput,
    allowWarnings: boolean,
  ) => {
    return appendInboxMessage(workspace, input, { allowWarnings });
  },
);

ipcMain.handle("automation:list", async (_event, workspace: string) => {
  return listMessageAutomations(workspace);
});

ipcMain.handle(
  "automation:create",
  async (_event, workspace: string, input: MessageAutomationInput) => {
    const result = await createMessageAutomation(workspace, input);
    mainWindow?.webContents.send(
      "automation:changed",
      await listMessageAutomations(workspace),
    );
    return result;
  },
);

ipcMain.handle(
  "automation:stop",
  async (_event, workspace: string, automationId: string) => {
    const result = await stopMessageAutomation(workspace, automationId);
    mainWindow?.webContents.send(
      "automation:changed",
      await listMessageAutomations(workspace),
    );
    return result;
  },
);

ipcMain.handle("mailbox:watch", async (_event, workspace: string) => {
  if (stopMailboxWatch) {
    await stopMailboxWatch();
    stopMailboxWatch = null;
  }
  startAutomationRunner(workspace);
  stopMailboxWatch = watchMailbox(workspace, (snapshot) => {
    mainWindow?.webContents.send("mailbox:snapshot", snapshot);
  });
  return readMailboxSnapshot(workspace);
});

ipcMain.handle("mailbox:unwatch", async () => {
  if (stopMailboxWatch) {
    await stopMailboxWatch();
    stopMailboxWatch = null;
  }
  stopAutomationRunner();
});

ipcMain.handle("install:preview", async (_event, workspace: string) => {
  const agentsPath = path.join(workspace, "AGENTS.md");
  const currentAgents = await fs.readFile(agentsPath, "utf8").catch(() => "");
  return previewAgentsUpdate(
    currentAgents,
    createCodexPigeonInstallAssets().agentsSection,
  );
});

ipcMain.handle("install:status", async (_event, workspace: string) => {
  return inspectCodexPigeonWorkspace(workspace);
});

ipcMain.handle("install:apply", async (_event, workspace: string) => {
  return installCodexPigeonWorkspace(
    workspace,
    createCodexPigeonInstallAssets(),
  );
});

ipcMain.handle("codex:threads", async () => {
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
    return {
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
    };
  } catch (error) {
    return {
      ok: false,
      mode: "degraded",
      error: error instanceof Error ? error.message : String(error),
      threads: [],
      loadedThreadIds: [],
    };
  }
});

ipcMain.handle("codex:hooks", async (_event, workspace: string) => {
  try {
    const client = await getCodexClient();
    return {
      ok: true,
      mode: client.mode,
      hooks: await client.listHooks([workspace]),
    };
  } catch (error) {
    return {
      ok: false,
      mode: "degraded",
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

app
  .whenReady()
  .then(createWindow)
  .catch((error) => {
    console.error(error);
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopAutomationRunner();
  if (stopMailboxWatch) {
    void stopMailboxWatch();
  }
  void codexClientPromise
    ?.then((client) => client.close())
    .catch(() => undefined);
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
