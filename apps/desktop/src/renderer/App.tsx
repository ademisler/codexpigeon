import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  Archive,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  CircleStop,
  Clock,
  FolderOpen,
  Inbox,
  Maximize2,
  MessageSquareText,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pin,
  RefreshCw,
  Repeat2,
  Search,
  Send,
  Settings,
  Shield,
  TerminalSquare,
  Wrench,
} from "lucide-react";
import { Button, IconButton, Panel, StatusDot } from "@codexpigeon/ui";
import type {
  MailboxSnapshot,
  MessageAutomation,
  ThreadSummary,
  Warning,
} from "./types";

type AppServerState = {
  ok: boolean;
  mode: string;
  error?: string;
  loadedThreadIds: string[];
  detection?: {
    mode: string;
    recentRunningWindowSeconds: number;
    liveProxyAvailable: boolean;
    logStreamingThreads?: number;
  };
};

type HookState = {
  ok: boolean;
  mode: string;
  hooks?: {
    data: Array<{
      cwd: string;
      hooks: Array<{
        key: string;
        eventName: string;
        enabled: boolean;
        trustStatus: string;
        command: string | null;
      }>;
      warnings: string[];
      errors: Array<{ message: string }>;
    }>;
  };
  error?: string;
};

type InstallStatus = {
  workspace: string;
  installed: boolean;
  agents: {
    exists: boolean;
    managedBlock: boolean;
    malformedManagedBlock: boolean;
  };
  hooks: {
    hooksJsonExists: boolean;
    codexPigeonHook: boolean;
    hookScriptExists: boolean;
  };
  mailbox: {
    directoryExists: boolean;
    readmeExists: boolean;
    gitignoreExists: boolean;
    inboxExists: boolean;
    outboxExists: boolean;
    receiptsExists: boolean;
    stateExists: boolean;
  };
  missing: string[];
  warnings: string[];
};

const defaultAppServer: AppServerState = {
  ok: false,
  mode: "degraded",
  loadedThreadIds: [],
};

type ActiveView = "mailbox" | "receipts" | "outbox" | "archives" | "settings";
type RepeatUnit = "seconds" | "minutes" | "hours";

const LAYOUT_STORAGE_KEYS = {
  leftCollapsed: "codexpigeon.layout.leftCollapsed",
  rightCollapsed: "codexpigeon.layout.rightCollapsed",
};

const DEMO_WORKSPACE = "/Users/demo/Projects/codexpigeon-demo";

const DEMO_THREADS: ThreadSummary[] = [
  {
    id: "thread_demo_active",
    name: "Release prep",
    preview: "Review mailbox install flow and screenshots.",
    cwd: DEMO_WORKSPACE,
    updatedAt: 1779272100,
    status: { type: "active", activeFlags: ["waitingOnApproval"] },
    activity: {
      kind: "running",
      reason: "Demo activity stream",
      lastSeenAt: 1779272100,
      detectionMode: "demo",
    },
  },
  {
    id: "thread_demo_docs",
    name: "Docs polish",
    preview: "Tighten README and release checklist.",
    cwd: "/Users/demo/Projects/docs-worktree",
    updatedAt: 1779268500,
    status: { type: "idle" },
    activity: {
      kind: "idle",
      reason: "No recent activity",
      lastSeenAt: 1779268500,
      detectionMode: "demo",
    },
  },
  {
    id: "thread_demo_ui",
    name: "UI overflow check",
    preview: "Verify repeat messages stay inside the inspector.",
    cwd: "/Users/demo/Projects/ui-smoke",
    updatedAt: 1779264900,
    status: { type: "idle" },
    activity: {
      kind: "idle",
      reason: "No recent activity",
      lastSeenAt: 1779264900,
      detectionMode: "demo",
    },
  },
];

const DEMO_SNAPSHOT: MailboxSnapshot = {
  workspace: DEMO_WORKSPACE,
  inbox: [
    {
      id: "msg_20260520T090000_01demo000000000000000000",
      createdAt: "2026-05-20T09:00:00.000Z",
      priority: "high",
      scope: "current_task",
      body: "Before final response, check that the installer preview only touches CodexPigeon-managed files.",
    },
    {
      id: "msg_20260520T091500_01demo000000000000000001",
      createdAt: "2026-05-20T09:15:00.000Z",
      priority: "normal",
      scope: "workspace",
      body: "Keep the active turn uninterrupted; reply through OUTBOX.md only if a human-readable note is needed.",
    },
  ],
  outbox: [
    {
      id: "reply_20260520T092000_01demo0000000000000000",
      to: "msg_20260520T090000_01demo000000000000000000",
      createdAt: "2026-05-20T09:20:00.000Z",
      body: "Installer preview reviewed. No active chat steering is used.",
    },
  ],
  receipts: [
    {
      id: "receipt_20260520T092000_01demo00000000000000",
      messageId: "msg_20260520T090000_01demo000000000000000000",
      seenAt: "2026-05-20T09:20:00.000Z",
      decision: "accepted",
      actionStatus: "applied",
      summary: "Preview checked and documented.",
      notes: null,
    },
  ],
  automations: [
    {
      id: "auto_20260520T093000_01demo0000000000000000",
      status: "active",
      body: "Re-check mailbox status before the release handoff.",
      priority: "normal",
      scope: "current_task",
      intervalMs: 300000,
      createdAt: "2026-05-20T09:30:00.000Z",
      updatedAt: "2026-05-20T09:30:00.000Z",
      nextRunAt: "2026-05-20T09:35:00.000Z",
      lastSentAt: null,
      sentCount: 0,
      sourceMessageId: "msg_20260520T091500_01demo000000000000000001",
      allowWarnings: false,
    },
  ],
  statuses: {
    msg_20260520T090000_01demo000000000000000000: "applied",
    msg_20260520T091500_01demo000000000000000001: "unseen",
  },
  unreadMessageIds: ["msg_20260520T091500_01demo000000000000000001"],
};

function createBrowserLocalApi() {
  const mailboxCallbacks = new Set<(snapshot: unknown) => void>();
  const automationCallbacks = new Set<(automations: unknown) => void>();
  const automationErrorCallbacks = new Set<(error: unknown) => void>();
  let pollTimer: number | null = null;
  let watchedWorkspace = "";

  async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const payload = (await response.json()) as T & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? `Request failed: ${response.status}`);
    }
    return payload;
  }

  async function snapshot(workspace: string): Promise<MailboxSnapshot> {
    return apiFetch<MailboxSnapshot>("/api/mailbox/snapshot", {
      method: "POST",
      body: JSON.stringify({ workspace }),
    });
  }

  async function runDue(workspace: string) {
    return apiFetch<{ sent: unknown[] }>("/api/automations/run-due", {
      method: "POST",
      body: JSON.stringify({ workspace }),
    });
  }

  return {
    selectWorkspace: async () => {
      return localStorage.getItem("codexpigeon.workspace");
    },
    getMailboxSnapshot: snapshot,
    validateMessage: async (body: string) =>
      apiFetch<Warning[]>("/api/mailbox/validate", {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    sendMessage: async (
      workspace: string,
      input: unknown,
      allowWarnings: boolean,
    ) =>
      apiFetch("/api/mailbox/send", {
        method: "POST",
        body: JSON.stringify({ workspace, input, allowWarnings }),
      }),
    listAutomations: async (workspace: string) =>
      apiFetch<MessageAutomation[]>("/api/automations/list", {
        method: "POST",
        body: JSON.stringify({ workspace }),
      }),
    createAutomation: async (workspace: string, input: unknown) =>
      apiFetch("/api/automations/create", {
        method: "POST",
        body: JSON.stringify({ workspace, input }),
      }),
    stopAutomation: async (workspace: string, automationId: string) =>
      apiFetch("/api/automations/stop", {
        method: "POST",
        body: JSON.stringify({ workspace, automationId }),
      }),
    watchMailbox: async (workspace: string) => {
      watchedWorkspace = workspace;
      await runDue(workspace).catch(() => undefined);
      const first = await snapshot(workspace);
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
      }
      pollTimer = window.setInterval(() => {
        if (!watchedWorkspace) {
          return;
        }
        void runDue(watchedWorkspace)
          .then((result) => {
            if (result.sent.length > 0) {
              return apiFetch<MessageAutomation[]>("/api/automations/list", {
                method: "POST",
                body: JSON.stringify({ workspace: watchedWorkspace }),
              }).then((automations) => {
                for (const callback of automationCallbacks) {
                  callback(automations);
                }
              });
            }
            return undefined;
          })
          .then(() => snapshot(watchedWorkspace))
          .then((next) => {
            for (const callback of mailboxCallbacks) {
              callback(next);
            }
          })
          .catch((error) => {
            for (const callback of automationErrorCallbacks) {
              callback(error);
            }
          });
      }, 1500);
      return first;
    },
    unwatchMailbox: async () => {
      watchedWorkspace = "";
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    },
    previewInstall: async (workspace: string) =>
      apiFetch<string>("/api/install/preview", {
        method: "POST",
        body: JSON.stringify({ workspace }),
      }),
    inspectInstall: async (workspace: string) =>
      apiFetch<InstallStatus>("/api/install/status", {
        method: "POST",
        body: JSON.stringify({ workspace }),
      }),
    applyInstall: async (workspace: string) =>
      apiFetch("/api/install/apply", {
        method: "POST",
        body: JSON.stringify({ workspace }),
      }),
    listThreads: async () =>
      apiFetch<{
        ok: boolean;
        mode: string;
        error?: string;
        threads: ThreadSummary[];
        loadedThreadIds: string[];
        detection?: AppServerState["detection"];
      }>("/api/codex/threads"),
    listHooks: async (workspace: string) =>
      apiFetch<HookState>("/api/codex/hooks", {
        method: "POST",
        body: JSON.stringify({ workspace }),
      }),
    onMailboxSnapshot: (callback: (snapshot: unknown) => void) => {
      mailboxCallbacks.add(callback);
      return () => {
        mailboxCallbacks.delete(callback);
      };
    },
    onCodexNotification: () => () => undefined,
    onAutomationChanged: (callback: (automations: unknown) => void) => {
      automationCallbacks.add(callback);
      return () => {
        automationCallbacks.delete(callback);
      };
    },
    onAutomationError: (callback: (error: unknown) => void) => {
      automationErrorCallbacks.add(callback);
      return () => {
        automationErrorCallbacks.delete(callback);
      };
    },
  };
}

function createDemoApi() {
  return {
    selectWorkspace: async () => DEMO_WORKSPACE,
    getMailboxSnapshot: async () => DEMO_SNAPSHOT,
    validateMessage: async () => [],
    sendMessage: async () => ({
      message: {
        id: "msg_20260520T100000_01demo0000000000000000",
      },
    }),
    listAutomations: async () => DEMO_SNAPSHOT.automations,
    createAutomation: async () => ({
      automation: DEMO_SNAPSHOT.automations[0],
      warnings: [],
    }),
    stopAutomation: async () => ({
      ...DEMO_SNAPSHOT.automations[0],
      status: "paused",
    }),
    watchMailbox: async () => DEMO_SNAPSHOT,
    unwatchMailbox: async () => undefined,
    previewInstall: async () =>
      [
        "<!-- CODEXPIGEON_MAILBOX_START -->",
        "## Codex Mailbox Protocol",
        "",
        "Check `.codex-mailbox/INBOX.md` at safe checkpoints.",
        "<!-- CODEXPIGEON_MAILBOX_END -->",
      ].join("\n"),
    inspectInstall: async () => ({
      workspace: DEMO_WORKSPACE,
      installed: true,
      agents: {
        exists: true,
        managedBlock: true,
        malformedManagedBlock: false,
      },
      hooks: {
        hooksJsonExists: true,
        codexPigeonHook: true,
        hookScriptExists: true,
      },
      mailbox: {
        directoryExists: true,
        readmeExists: true,
        gitignoreExists: true,
        inboxExists: true,
        outboxExists: true,
        receiptsExists: true,
        stateExists: true,
      },
      missing: [],
      warnings: [],
    }),
    applyInstall: async () => ({
      created: [],
      updated: [],
      unchanged: ["AGENTS.md", ".codex/hooks.json"],
    }),
    listThreads: async () => ({
      ok: true,
      mode: "demo",
      threads: DEMO_THREADS,
      loadedThreadIds: ["thread_demo_active"],
      detection: {
        mode: "demo",
        recentRunningWindowSeconds: 45,
        liveProxyAvailable: false,
        logStreamingThreads: 1,
      },
    }),
    listHooks: async () => ({
      ok: true,
      mode: "demo",
      hooks: {
        data: [
          {
            cwd: DEMO_WORKSPACE,
            hooks: [
              {
                key: "codexpigeon-session-start",
                eventName: "SessionStart",
                enabled: true,
                trustStatus: "trusted",
                command: "python3 .codex/hooks/codexpigeon_mailbox_hook.py",
              },
              {
                key: "codexpigeon-post-tool",
                eventName: "PostToolUse",
                enabled: true,
                trustStatus: "trusted",
                command: "python3 .codex/hooks/codexpigeon_mailbox_hook.py",
              },
            ],
            warnings: [],
            errors: [],
          },
        ],
      },
    }),
    onMailboxSnapshot: () => () => undefined,
    onCodexNotification: () => () => undefined,
    onAutomationChanged: () => () => undefined,
    onAutomationError: () => () => undefined,
  };
}

function formatTime(input: number | string | null | undefined): string {
  if (!input) {
    return "never";
  }
  const date =
    typeof input === "number" ? new Date(input * 1000) : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "2-digit",
  }).format(date);
}

function formatInterval(intervalMs: number): string {
  const seconds = Math.round(intervalMs / 1000);
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

function repeatIntervalMs(value: string, unit: RepeatUnit): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return Number.NaN;
  }
  const multiplier =
    unit === "hours" ? 60 * 60 * 1000 : unit === "minutes" ? 60 * 1000 : 1000;
  return Math.round(numeric * multiplier);
}

function automationSummary(automation: MessageAutomation): string {
  if (automation.status !== "active") {
    return `paused after ${automation.sentCount} repeats`;
  }
  return `next ${formatTime(automation.nextRunAt)} · ${automation.sentCount} sent`;
}

function threadStatus(
  status: ThreadSummary["status"],
): "active" | "idle" | "degraded" | "error" {
  if (status.type === "active") {
    return "active";
  }
  if (status.type === "idle") {
    return "idle";
  }
  if (status.type === "systemError") {
    return "error";
  }
  return "degraded";
}

function statusLabel(
  snapshot: MailboxSnapshot | null,
  messageId: string,
): string {
  return snapshot?.statuses[messageId] ?? "unseen";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function compactPath(input: string): string {
  if (!input) {
    return "no workspace";
  }
  const normalized = input.replace(/\\/g, "/");
  const homeMatch = normalized.match(/^\/(?:Users|home)\/[^/]+(?=\/|$)/);
  const display = homeMatch
    ? `~${normalized.slice(homeMatch[0].length)}`
    : normalized;
  const parts = display.split("/").filter(Boolean);
  if (parts.length <= 3) {
    return display;
  }
  return `.../${parts.slice(-2).join("/")}`;
}

function threadTitle(thread: ThreadSummary): string {
  return thread.name || thread.preview || compactPath(thread.cwd);
}

function PigeonEmoji({ className = "" }: { className?: string }) {
  return (
    <span className={className} role="img" aria-label="CodexPigeon dove">
      🕊️
    </span>
  );
}

export default function App() {
  const isDemoMode = useMemo(
    () => new URLSearchParams(window.location.search).get("demo") === "1",
    [],
  );
  const api = useMemo(
    () =>
      isDemoMode
        ? createDemoApi()
        : (window.codexpigeon ?? createBrowserLocalApi()),
    [isDemoMode],
  );
  const isBrowserLocalApi = !window.codexpigeon && !isDemoMode;
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState(() =>
    isDemoMode
      ? DEMO_WORKSPACE
      : (localStorage.getItem("codexpigeon.workspace") ?? ""),
  );
  const [workspacePathInput, setWorkspacePathInput] = useState(() =>
    isDemoMode
      ? DEMO_WORKSPACE
      : (localStorage.getItem("codexpigeon.workspace") ?? ""),
  );
  const [snapshot, setSnapshot] = useState<MailboxSnapshot | null>(null);
  const [appServer, setAppServer] = useState<AppServerState>(defaultAppServer);
  const [hooks, setHooks] = useState<HookState | null>(null);
  const [installStatus, setInstallStatus] = useState<InstallStatus | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<"normal" | "high" | "low">("normal");
  const [scope, setScope] = useState("current_task");
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatEvery, setRepeatEvery] = useState("5");
  const [repeatUnit, setRepeatUnit] = useState<RepeatUnit>("minutes");
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [installPreview, setInstallPreview] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeView, setActiveView] = useState<ActiveView>("mailbox");
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null,
  );
  const [navNotice, setNavNotice] = useState<string | null>(null);
  const [leftRailCollapsed, setLeftRailCollapsed] = useState(
    () => localStorage.getItem(LAYOUT_STORAGE_KEYS.leftCollapsed) === "true",
  );
  const [rightInspectorCollapsed, setRightInspectorCollapsed] = useState(
    () => localStorage.getItem(LAYOUT_STORAGE_KEYS.rightCollapsed) === "true",
  );
  const [focusMode, setFocusMode] = useState(false);
  const workspaceInputRef = useRef<HTMLInputElement | null>(null);

  const selectedThread =
    threads.find((thread) => thread.id === selectedThreadId) ?? null;
  const effectiveLeftCollapsed = focusMode || leftRailCollapsed;
  const effectiveRightCollapsed = focusMode || rightInspectorCollapsed;
  const shellStyle = {
    "--left-rail-width": effectiveLeftCollapsed ? "68px" : "292px",
    "--right-inspector-width": effectiveRightCollapsed ? "0px" : "340px",
  } as CSSProperties;

  const filteredThreads = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    if (!lowered) {
      return threads;
    }
    return threads.filter((thread) =>
      `${thread.name ?? ""} ${thread.preview} ${thread.cwd}`
        .toLowerCase()
        .includes(lowered),
    );
  }, [query, threads]);
  const automations = snapshot?.automations ?? [];
  const activeAutomations = automations.filter(
    (automation) => automation.status === "active",
  );
  const plannedRepeatMs = repeatIntervalMs(repeatEvery, repeatUnit);

  const loadThreads = useCallback(async () => {
    try {
      const result = (await api.listThreads()) as {
        ok: boolean;
        mode: string;
        error?: string;
        threads: ThreadSummary[];
        loadedThreadIds: string[];
        detection?: AppServerState["detection"];
      };
      setAppServer({
        ok: result.ok,
        mode: result.mode,
        error: result.error,
        loadedThreadIds: result.loadedThreadIds ?? [],
        detection: result.detection,
      });
      setThreads(result.threads ?? []);
    } catch (error) {
      setAppServer({
        ok: false,
        mode: "degraded",
        error: errorMessage(error),
        loadedThreadIds: [],
      });
      setThreads([]);
    }
  }, [api]);

  const loadHooks = useCallback(
    async (nextWorkspace: string) => {
      const result = (await api.listHooks(nextWorkspace)) as HookState;
      setHooks(result);
    },
    [api],
  );

  const loadInstallStatus = useCallback(
    async (nextWorkspace: string) => {
      const result = (await api.inspectInstall(nextWorkspace)) as InstallStatus;
      setInstallStatus(result);
    },
    [api],
  );

  const selectWorkspace = useCallback(async () => {
    if (isBrowserLocalApi) {
      setRightInspectorCollapsed(false);
      setFocusMode(false);
      window.requestAnimationFrame(() => {
        workspaceInputRef.current?.focus();
        workspaceInputRef.current?.select();
      });
      return;
    }

    const picked = await api.selectWorkspace();
    if (picked) {
      setWorkspace(picked);
      setWorkspacePathInput(picked);
      localStorage.setItem("codexpigeon.workspace", picked);
      setInstallPreview(null);
      setInstallStatus(null);
    }
  }, [api, isBrowserLocalApi]);

  const useWorkspacePathInput = useCallback(() => {
    const next = workspacePathInput.trim();
    if (!next) {
      return;
    }
    setWorkspace(next);
    localStorage.setItem("codexpigeon.workspace", next);
    setInstallPreview(null);
    setInstallStatus(null);
  }, [workspacePathInput]);

  const refreshSnapshot = useCallback(async () => {
    if (!workspace) {
      return;
    }
    const next = (await api.getMailboxSnapshot(workspace)) as MailboxSnapshot;
    setSnapshot(next);
  }, [api, workspace]);

  useEffect(() => {
    void loadThreads();
    const stop = api.onCodexNotification(() => {
      void loadThreads();
    });
    const interval = window.setInterval(() => {
      void loadThreads();
    }, 2500);
    return () => {
      stop();
      window.clearInterval(interval);
    };
  }, [api, loadThreads]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void selectWorkspace();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectWorkspace]);

  useEffect(() => {
    if (!workspace) {
      setSnapshot(null);
      return undefined;
    }

    localStorage.setItem("codexpigeon.workspace", workspace);
    void api
      .watchMailbox(workspace)
      .then((next) => setSnapshot(next as MailboxSnapshot))
      .catch((error) => {
        setSnapshot(null);
        setNotice(`Mailbox load failed: ${errorMessage(error)}`);
      });
    void loadHooks(workspace).catch((error) => {
      setHooks({ ok: false, mode: "degraded", error: errorMessage(error) });
    });
    void loadInstallStatus(workspace).catch((error) => {
      setInstallStatus({
        workspace,
        installed: false,
        agents: {
          exists: false,
          managedBlock: false,
          malformedManagedBlock: false,
        },
        hooks: {
          hooksJsonExists: false,
          codexPigeonHook: false,
          hookScriptExists: false,
        },
        mailbox: {
          directoryExists: false,
          readmeExists: false,
          gitignoreExists: false,
          inboxExists: false,
          outboxExists: false,
          receiptsExists: false,
          stateExists: false,
        },
        missing: ["Unable to inspect workspace"],
        warnings: [errorMessage(error)],
      });
    });

    const stop = api.onMailboxSnapshot((next) => {
      setSnapshot(next as MailboxSnapshot);
    });

    return () => {
      stop();
      void api.unwatchMailbox();
    };
  }, [api, workspace, loadHooks, loadInstallStatus]);

  useEffect(() => {
    const stopChanged = api.onAutomationChanged((next) => {
      setSnapshot((current) =>
        current
          ? {
              ...current,
              automations: next as MessageAutomation[],
            }
          : current,
      );
    });
    const stopError = api.onAutomationError((error) => {
      setNotice(`Automation runner failed: ${errorMessage(error)}`);
    });

    return () => {
      stopChanged();
      stopError();
    };
  }, [api]);

  useEffect(() => {
    localStorage.setItem(
      LAYOUT_STORAGE_KEYS.leftCollapsed,
      String(leftRailCollapsed),
    );
  }, [leftRailCollapsed]);

  useEffect(() => {
    localStorage.setItem(
      LAYOUT_STORAGE_KEYS.rightCollapsed,
      String(rightInspectorCollapsed),
    );
  }, [rightInspectorCollapsed]);

  function toggleLeftRail() {
    setFocusMode(false);
    setLeftRailCollapsed((current) => !current);
  }

  function toggleRightInspector() {
    setFocusMode(false);
    setRightInspectorCollapsed((current) => !current);
  }

  function toggleFocusMode() {
    setFocusMode((current) => !current);
  }

  async function handleThreadSelect(thread: ThreadSummary) {
    setSelectedThreadId(thread.id);
    setWorkspace(thread.cwd);
    setWorkspacePathInput(thread.cwd);
    setInstallPreview(null);
    setInstallStatus(null);
    setActiveView("mailbox");
    setSelectedMessageId(null);
  }

  async function handleSend(allowWarnings = false) {
    const trimmed = message.trim();
    if (!workspace || !trimmed) {
      return;
    }
    const intervalMs = repeatIntervalMs(repeatEvery, repeatUnit);
    if (repeatEnabled && (!Number.isFinite(intervalMs) || intervalMs < 5000)) {
      setNotice("Repeat interval must be at least 5 seconds.");
      return;
    }

    try {
      const nextWarnings = (await api.validateMessage(trimmed)) as Warning[];
      setWarnings(nextWarnings);
      if (nextWarnings.length > 0 && !allowWarnings) {
        return;
      }

      const sent = (await api.sendMessage(
        workspace,
        {
          body: trimmed,
          priority,
          scope,
        },
        allowWarnings,
      )) as { message: { id: string } };
      if (repeatEnabled) {
        await api.createAutomation(workspace, {
          body: trimmed,
          priority,
          scope,
          intervalMs,
          sourceMessageId: sent.message.id,
          allowWarnings,
        });
      }
      setMessage("");
      setWarnings([]);
      setNotice(
        repeatEnabled
          ? `Message appended and scheduled every ${formatInterval(intervalMs)}`
          : "Message appended to INBOX.md",
      );
      await refreshSnapshot();
    } catch (error) {
      setNotice(`Send failed: ${errorMessage(error)}`);
    }
  }

  async function handleStopAutomation(automationId: string) {
    if (!workspace) {
      return;
    }
    try {
      await api.stopAutomation(workspace, automationId);
      setNotice("Automation paused.");
      await refreshSnapshot();
    } catch (error) {
      setNotice(`Stop failed: ${errorMessage(error)}`);
    }
  }

  async function handlePreviewInstall() {
    if (!workspace) {
      return;
    }
    try {
      setInstallPreview((await api.previewInstall(workspace)) as string);
    } catch (error) {
      setNotice(`Preview failed: ${errorMessage(error)}`);
    }
  }

  async function handleApplyInstall() {
    if (!workspace || !installPreview) {
      return;
    }
    try {
      const result = (await api.applyInstall(workspace)) as {
        created: string[];
        updated: string[];
        unchanged: string[];
      };
      setNotice(
        `Installed: ${result.created.length} created, ${result.updated.length} updated`,
      );
      setInstallPreview(null);
      await refreshSnapshot();
      await loadHooks(workspace);
      await loadInstallStatus(workspace);
    } catch (error) {
      setNotice(`Install failed: ${errorMessage(error)}`);
    }
  }

  const hookEntry = hooks?.hooks?.data?.[0];
  const activeStatus = appServer.ok ? "active" : "degraded";
  const installHealth = installStatus?.installed
    ? "installed"
    : workspace
      ? "needs setup"
      : "no workspace";
  const runningThreads = threads.filter(
    (thread) => threadStatus(thread.status) === "active",
  );
  function switchView(view: ActiveView) {
    setActiveView(view);
    setNavNotice(null);
    if (view === "archives") {
      setNavNotice(
        "Archive storage is planned; runtime mailbox files are still live.",
      );
    }
    if (view === "settings") {
      setNavNotice("Settings are local development diagnostics for now.");
    }
  }

  return (
    <div
      className={[
        "app-shell",
        effectiveLeftCollapsed ? "left-collapsed" : "",
        effectiveRightCollapsed ? "right-collapsed" : "",
        focusMode ? "focus-mode" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={shellStyle}
    >
      <aside className="left-rail" aria-label="CodexPigeon navigation">
        <div className="brand-row">
          <PigeonEmoji className="brand-mark" />
          <span className="brand-copy">
            CodexPigeon
            <small>quiet carrier</small>
          </span>
          <IconButton
            className="rail-toggle"
            label={
              effectiveLeftCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
            onClick={toggleLeftRail}
          >
            {effectiveLeftCollapsed ? (
              <PanelLeftOpen size={16} />
            ) : (
              <PanelLeftClose size={16} />
            )}
          </IconButton>
        </div>

        <button className="new-chat-button" onClick={selectWorkspace}>
          <FolderOpen size={16} />
          <span className="button-label">
            {isBrowserLocalApi ? "Focus path" : "Select workspace"}
          </span>
          <span className="shortcut">Ctrl+O</span>
        </button>

        <label className="search-box">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search threads"
          />
        </label>

        <nav className="nav-list">
          <button
            className={activeView === "mailbox" ? "active" : ""}
            onClick={() => switchView("mailbox")}
            title="Mailbox"
          >
            <Inbox size={16} /> <span className="nav-label">Mailbox</span>
          </button>
          <button
            className={activeView === "receipts" ? "active" : ""}
            onClick={() => switchView("receipts")}
            title="Receipts"
          >
            <Bell size={16} /> <span className="nav-label">Receipts</span>
          </button>
          <button
            className={activeView === "outbox" ? "active" : ""}
            onClick={() => switchView("outbox")}
            title="Outbox"
          >
            <MessageSquareText size={16} />{" "}
            <span className="nav-label">Outbox</span>
          </button>
          <button
            className={activeView === "archives" ? "active" : ""}
            onClick={() => switchView("archives")}
            title="Archives"
          >
            <Archive size={16} /> <span className="nav-label">Archives</span>
          </button>
        </nav>

        <div className="rail-heading">Running now</div>
        <div className="running-list">
          {runningThreads.slice(0, 4).map((thread) => (
            <button
              key={thread.id}
              className="running-row"
              onClick={() => void handleThreadSelect(thread)}
            >
              <StatusDot status="active" />
              <span>{thread.name || thread.preview || "Active thread"}</span>
            </button>
          ))}
          {runningThreads.length === 0 && (
            <p className="empty-copy">No active agent detected right now.</p>
          )}
        </div>

        <div className="rail-heading">Threads</div>
        <div className="thread-list">
          {filteredThreads.map((thread) => (
            <button
              key={thread.id}
              className={
                thread.id === selectedThreadId
                  ? "thread-row selected"
                  : "thread-row"
              }
              onClick={() => void handleThreadSelect(thread)}
            >
              <StatusDot status={threadStatus(thread.status)} />
              <span className="thread-copy" title={thread.cwd}>
                <strong>{threadTitle(thread)}</strong>
                <small>{compactPath(thread.cwd)}</small>
              </span>
              <span className="thread-side">
                {thread.activity?.kind === "running" ? (
                  <em>live</em>
                ) : (
                  <time>{formatTime(thread.updatedAt)}</time>
                )}
              </span>
            </button>
          ))}
          {filteredThreads.length === 0 && (
            <p className="empty-copy">No threads available from App Server.</p>
          )}
        </div>

        <div className="rail-footer">
          <button
            className={activeView === "settings" ? "active" : ""}
            onClick={() => switchView("settings")}
            title="Settings"
          >
            <Settings size={16} /> <span className="nav-label">Settings</span>
          </button>
        </div>
      </aside>

      <main className="work-surface">
        <header className="top-bar">
          <div>
            <h1>{selectedThread?.name || "Mailbox Console"}</h1>
            <p>
              {workspace || "Select a repo/worktree to activate mailbox mode."}
            </p>
          </div>
          <div className="top-actions">
            <IconButton
              label={
                effectiveLeftCollapsed
                  ? "Expand left panel"
                  : "Narrow left panel"
              }
              onClick={toggleLeftRail}
            >
              {effectiveLeftCollapsed ? (
                <PanelLeftOpen size={16} />
              ) : (
                <PanelLeftClose size={16} />
              )}
            </IconButton>
            <IconButton
              label={focusMode ? "Exit focus mode" : "Focus mailbox"}
              onClick={toggleFocusMode}
            >
              {focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </IconButton>
            <IconButton
              label={
                effectiveRightCollapsed
                  ? "Show right inspector"
                  : "Narrow right inspector"
              }
              onClick={toggleRightInspector}
            >
              {effectiveRightCollapsed ? (
                <PanelRightOpen size={16} />
              ) : (
                <PanelRightClose size={16} />
              )}
            </IconButton>
            <IconButton
              label="Refresh"
              onClick={() =>
                void Promise.all([loadThreads(), refreshSnapshot()])
              }
            >
              <RefreshCw size={16} />
            </IconButton>
            <Button onClick={handlePreviewInstall} disabled={!workspace}>
              <Wrench size={15} />{" "}
              {installStatus?.installed ? "Review install" : "Preview install"}
            </Button>
          </div>
        </header>

        <section className="status-strip">
          <div className="status-cell">
            <Inbox size={15} />
            <span>Mailbox</span>
            <strong>{snapshot ? `${snapshot.inbox.length}` : "off"}</strong>
          </div>
          <div className="status-cell">
            <Bell size={15} />
            <span>Unread</span>
            <strong>{snapshot?.unreadMessageIds.length ?? 0}</strong>
          </div>
          <div className="status-cell">
            <MessageSquareText size={15} />
            <span>Replies</span>
            <strong>{snapshot?.outbox.length ?? 0}</strong>
          </div>
          <div className="status-cell">
            <Repeat2 size={15} />
            <span>Auto</span>
            <strong>{activeAutomations.length}</strong>
          </div>
          <div className="status-cell">
            <CheckCircle2 size={15} />
            <span>Receipts</span>
            <strong>{snapshot?.receipts.length ?? 0}</strong>
          </div>
          <div className="status-cell">
            <Activity size={15} />
            <span>Pigeon</span>
            <strong>{installHealth}</strong>
          </div>
        </section>

        <Panel
          className={
            installStatus?.installed
              ? "pigeon-banner installed"
              : "pigeon-banner"
          }
        >
          <PigeonEmoji className="pigeon-banner-mark" />
          <div>
            <h2>
              {installStatus?.installed
                ? "Carrier is nested here"
                : "Set up the carrier nest"}
            </h2>
            <p>
              {installStatus?.installed
                ? "This workspace already has the AGENTS.md mailbox block, hooks, and mailbox files."
                : "Preview the install before changing the workspace. Apply install only writes CodexPigeon-managed files."}
            </p>
          </div>
          <strong
            className={
              installStatus?.installed
                ? "badge badge-accepted"
                : "badge badge-unseen"
            }
          >
            {installStatus?.installed ? "installed" : "not installed"}
          </strong>
        </Panel>

        <Panel className="composer-panel">
          <div className="composer-header">
            <div>
              <h2>Send by pigeon</h2>
              <p>
                Writes only to `.codex-mailbox/INBOX.md`; no active chat
                steering.
              </p>
            </div>
            <PigeonEmoji className="panel-pigeon" />
          </div>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Write a quiet note for the carrier..."
          />
          {warnings.length > 0 && (
            <div className="warning-list">
              {warnings.map((warning) => (
                <p key={warning.code}>{warning.message}</p>
              ))}
            </div>
          )}
          <div className="composer-controls">
            <label>
              Priority
              <select
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as typeof priority)
                }
              >
                <option value="normal">normal</option>
                <option value="high">high</option>
                <option value="low">low</option>
              </select>
            </label>
            <label>
              Scope
              <select
                value={scope}
                onChange={(event) => setScope(event.target.value)}
              >
                <option value="current_task">current_task</option>
                <option value="workspace">workspace</option>
                <option value="thread">thread</option>
                <option value="question">question</option>
              </select>
            </label>
            <label className="repeat-toggle">
              <input
                type="checkbox"
                checked={repeatEnabled}
                onChange={(event) => setRepeatEnabled(event.target.checked)}
              />
              <span>
                <Repeat2 size={14} /> Repeat
              </span>
            </label>
            {repeatEnabled && (
              <div className="repeat-interval" aria-label="Repeat interval">
                <Clock size={14} />
                <input
                  value={repeatEvery}
                  onChange={(event) => setRepeatEvery(event.target.value)}
                  inputMode="decimal"
                  aria-label="Repeat every"
                />
                <select
                  value={repeatUnit}
                  onChange={(event) =>
                    setRepeatUnit(event.target.value as RepeatUnit)
                  }
                  aria-label="Repeat unit"
                >
                  <option value="seconds">seconds</option>
                  <option value="minutes">minutes</option>
                  <option value="hours">hours</option>
                </select>
              </div>
            )}
            <Button
              variant="primary"
              onClick={() => void handleSend(false)}
              disabled={
                !workspace ||
                !message.trim() ||
                (repeatEnabled &&
                  (!Number.isFinite(plannedRepeatMs) || plannedRepeatMs < 5000))
              }
            >
              <Send size={15} />{" "}
              {repeatEnabled ? "Send & schedule" : "Send by pigeon"}
            </Button>
            {warnings.length > 0 && (
              <Button variant="danger" onClick={() => void handleSend(true)}>
                Send anyway
              </Button>
            )}
          </div>
        </Panel>

        <section className="timeline">
          <div className="section-heading">
            <h2>
              {activeView === "mailbox" && "Mailbox timeline"}
              {activeView === "receipts" && "Receipts"}
              {activeView === "outbox" && "Agent replies"}
              {activeView === "archives" && "Archives"}
              {activeView === "settings" && "Settings"}
            </h2>
            <span>{notice || navNotice}</span>
          </div>
          {activeView === "mailbox" &&
            snapshot?.inbox.map((item) => {
              const replies = snapshot.outbox.filter(
                (reply) => reply.to === item.id,
              );
              return (
                <article
                  className={
                    item.id === selectedMessageId
                      ? "timeline-item selected"
                      : "timeline-item"
                  }
                  key={item.id}
                  onClick={() => setSelectedMessageId(item.id)}
                >
                  <div className="timeline-meta">
                    <span>{item.id}</span>
                    <strong
                      className={`badge badge-${statusLabel(snapshot, item.id)}`}
                    >
                      {statusLabel(snapshot, item.id)}
                    </strong>
                  </div>
                  <p>{item.body}</p>
                  <footer>
                    <span>{item.priority}</span>
                    <span>{item.scope}</span>
                    <time>{formatTime(item.createdAt)}</time>
                  </footer>
                  {replies.map((reply) => (
                    <div className="agent-reply" key={reply.id}>
                      <MessageSquareText size={15} />
                      <span>{reply.body}</span>
                    </div>
                  ))}
                </article>
              );
            })}
          {activeView === "receipts" &&
            snapshot?.receipts.map((receipt) => (
              <article
                className="timeline-item"
                key={receipt.id}
                onClick={() => setSelectedMessageId(receipt.messageId)}
              >
                <div className="timeline-meta">
                  <span>{receipt.id}</span>
                  <strong
                    className={`badge badge-${receipt.actionStatus || receipt.decision || "seen"}`}
                  >
                    {receipt.actionStatus || receipt.decision || "seen"}
                  </strong>
                </div>
                <p>
                  {receipt.summary ||
                    receipt.notes ||
                    "Receipt recorded by agent."}
                </p>
                <footer>
                  <span>{receipt.messageId || "unknown message"}</span>
                  <time>{formatTime(receipt.seenAt)}</time>
                </footer>
              </article>
            ))}
          {activeView === "outbox" &&
            snapshot?.outbox.map((reply) => (
              <article
                className="timeline-item"
                key={reply.id}
                onClick={() => setSelectedMessageId(reply.to)}
              >
                <div className="timeline-meta">
                  <span>{reply.id}</span>
                  <strong className="badge">reply</strong>
                </div>
                <p>{reply.body}</p>
                <footer>
                  <span>{reply.to || "no linked inbox message"}</span>
                  <time>{formatTime(reply.createdAt)}</time>
                </footer>
              </article>
            ))}
          {activeView === "archives" && (
            <Panel className="settings-panel">
              <h3>Archive controls</h3>
              <p>
                Archiving is intentionally not destructive yet. Live mailbox
                files remain visible until archive storage is implemented.
              </p>
              <Button
                onClick={() =>
                  setNavNotice(
                    "Archive action is disabled until ARCHIVE.md support lands.",
                  )
                }
              >
                Check archive status
              </Button>
            </Panel>
          )}
          {activeView === "settings" && (
            <Panel className="settings-panel">
              <h3>Diagnostics</h3>
              <dl>
                <div>
                  <dt>App Server mode</dt>
                  <dd>{appServer.mode}</dd>
                </div>
                <div>
                  <dt>Detection</dt>
                  <dd>
                    {appServer.detection?.liveProxyAvailable
                      ? "live proxy"
                      : "stdio + log fallback"}
                  </dd>
                </div>
                <div>
                  <dt>Streaming logs</dt>
                  <dd>{appServer.detection?.logStreamingThreads ?? 0}</dd>
                </div>
                <div>
                  <dt>Fallback window</dt>
                  <dd>
                    {appServer.detection?.recentRunningWindowSeconds ?? 45}s
                  </dd>
                </div>
                <div>
                  <dt>Threads</dt>
                  <dd>{threads.length}</dd>
                </div>
                <div>
                  <dt>Running</dt>
                  <dd>{runningThreads.length}</dd>
                </div>
              </dl>
              <Button onClick={() => void loadThreads()}>
                <RefreshCw size={15} /> Refresh thread state
              </Button>
            </Panel>
          )}
          {activeView === "mailbox" &&
            (!snapshot || snapshot.inbox.length === 0) && (
              <div className="empty-state">
                <PigeonEmoji className="empty-pigeon" />
                <p>
                  No inbox messages yet. Select a workspace and send the first
                  note.
                </p>
              </div>
            )}
          {activeView === "receipts" &&
            (!snapshot || snapshot.receipts.length === 0) && (
              <div className="empty-state">
                <CircleHelp size={22} />
                <p>
                  No receipts yet. The agent will write here after it sees an
                  inbox message.
                </p>
              </div>
            )}
          {activeView === "outbox" &&
            (!snapshot || snapshot.outbox.length === 0) && (
              <div className="empty-state">
                <CircleHelp size={22} />
                <p>No agent replies yet. OUTBOX.md replies will appear here.</p>
              </div>
            )}
        </section>
      </main>

      <aside
        className="right-inspector"
        aria-label="CodexPigeon inspector"
        tabIndex={0}
      >
        <Panel className="inspector-card">
          <div className="inspector-title">
            <h2>Sources</h2>
            <Pin size={16} />
          </div>
          <div className="source-row">
            <StatusDot status={activeStatus} />
            <span>App Server</span>
            <strong>{appServer.mode}</strong>
          </div>
          {appServer.error && <p className="muted">{appServer.error}</p>}
          <div className="source-row">
            <TerminalSquare size={16} />
            <span>Loaded threads</span>
            <strong>{appServer.loadedThreadIds.length}</strong>
          </div>
        </Panel>

        <Panel className="inspector-card">
          <div className="inspector-title">
            <h2>Workspace</h2>
            <ChevronDown size={16} />
          </div>
          {isBrowserLocalApi && (
            <p className="muted">
              Browser mode uses the local dev API. Type an absolute
              repo/worktree path, or open Electron for native folder selection.
            </p>
          )}
          <label className="path-input">
            Path
            <input
              ref={workspaceInputRef}
              value={workspacePathInput}
              onChange={(event) => setWorkspacePathInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  useWorkspacePathInput();
                }
              }}
              placeholder="/path/to/repo-or-worktree"
            />
          </label>
          <Button
            onClick={useWorkspacePathInput}
            disabled={!workspacePathInput.trim()}
          >
            <Check size={15} /> Use path
          </Button>
          <p className="path-copy">{workspace || "No workspace selected"}</p>
          {!isBrowserLocalApi && (
            <Button onClick={selectWorkspace}>
              <FolderOpen size={15} /> Choose folder
            </Button>
          )}
        </Panel>

        <Panel className="inspector-card">
          <div className="inspector-title">
            <h2>Pigeon install</h2>
            <PigeonEmoji className="inspector-pigeon" />
          </div>
          <div className="source-row">
            <StatusDot
              status={installStatus?.installed ? "idle" : "degraded"}
            />
            <span>Workspace setup</span>
            <strong>
              {installStatus?.installed ? "installed" : "needs setup"}
            </strong>
          </div>
          {installStatus?.warnings.map((warning) => (
            <p className="muted" key={warning}>
              {warning}
            </p>
          ))}
          {!installStatus?.installed && installStatus?.missing.length ? (
            <div className="missing-list">
              {installStatus.missing.slice(0, 6).map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          ) : null}
        </Panel>

        <Panel className="inspector-card">
          <div className="inspector-title">
            <h2>Auto carriers</h2>
            <Repeat2 size={16} />
          </div>
          <div className="source-row">
            <StatusDot
              status={activeAutomations.length > 0 ? "active" : "idle"}
            />
            <span>Active repeats</span>
            <strong>{activeAutomations.length}</strong>
          </div>
          <div className="automation-list">
            {automations.map((automation) => (
              <div className="automation-row" key={automation.id}>
                <div>
                  <strong>{formatInterval(automation.intervalMs)}</strong>
                  <small>{automationSummary(automation)}</small>
                </div>
                <p>{automation.body}</p>
                <footer>
                  <span>{automation.priority}</span>
                  <span>{automation.scope}</span>
                  {automation.sourceMessageId && (
                    <span>{automation.sourceMessageId}</span>
                  )}
                </footer>
                {automation.status === "active" && (
                  <Button
                    variant="secondary"
                    onClick={() => void handleStopAutomation(automation.id)}
                  >
                    <CircleStop size={14} /> Stop
                  </Button>
                )}
              </div>
            ))}
            {automations.length === 0 && (
              <p className="muted">
                Optional repeat sending appears here after you enable Repeat.
              </p>
            )}
          </div>
        </Panel>

        <Panel className="inspector-card">
          <div className="inspector-title">
            <h2>Hooks</h2>
            <Shield size={16} />
          </div>
          <div className="hook-list">
            {hookEntry?.hooks.map((hook) => (
              <div className="hook-row" key={hook.key}>
                <Check size={14} />
                <span>{hook.eventName}</span>
                <small>{hook.trustStatus}</small>
              </div>
            ))}
            {!hookEntry && (
              <p className="muted">
                Run installer preview to add mailbox hooks.
              </p>
            )}
          </div>
        </Panel>

        {installPreview && (
          <Panel className="inspector-card install-preview">
            <div className="inspector-title">
              <h2>Install preview</h2>
              <Wrench size={16} />
            </div>
            <pre>{installPreview}</pre>
            <Button variant="primary" onClick={() => void handleApplyInstall()}>
              Apply install
            </Button>
          </Panel>
        )}
      </aside>
    </div>
  );
}
