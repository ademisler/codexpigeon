export type RequestId = number;

export type JsonRpcResponse<T = unknown> = {
  id: RequestId;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
};

export type JsonRpcNotification = {
  method: string;
  params?: unknown;
};

export type ThreadStatus =
  | { type: "notLoaded" }
  | { type: "idle" }
  | { type: "systemError" }
  | { type: "active"; activeFlags: Array<"waitingOnApproval" | "waitingOnUserInput"> };

export type GitInfo = {
  repoRoot?: string | null;
  branch?: string | null;
  commit?: string | null;
  diffToRemote?: string | null;
};

export type Thread = {
  id: string;
  sessionId: string;
  forkedFromId: string | null;
  preview: string;
  ephemeral: boolean;
  modelProvider: string;
  createdAt: number;
  updatedAt: number;
  status: ThreadStatus;
  path: string | null;
  cwd: string;
  cliVersion: string;
  source: string;
  threadSource: string | null;
  agentNickname: string | null;
  agentRole: string | null;
  gitInfo: GitInfo | null;
  name: string | null;
  turns: unknown[];
};

export type ThreadListParams = {
  cursor?: string | null;
  limit?: number | null;
  sortKey?: "created_at" | "updated_at" | null;
  sortDirection?: "asc" | "desc" | null;
  modelProviders?: string[] | null;
  sourceKinds?: string[] | null;
  archived?: boolean | null;
  cwd?: string | string[] | null;
  useStateDbOnly?: boolean;
  searchTerm?: string | null;
};

export type ThreadListResponse = {
  data: Thread[];
  nextCursor?: string | null;
};

export type ThreadReadResponse = {
  thread: Thread;
};

export type ThreadLoadedListResponse = {
  data: string[];
  nextCursor: string | null;
};

export type HookMetadata = {
  key: string;
  eventName: string;
  handlerType: string;
  matcher: string | null;
  command: string | null;
  statusMessage: string | null;
  sourcePath: string;
  enabled: boolean;
  trustStatus: string;
};

export type HooksListResponse = {
  data: Array<{
    cwd: string;
    hooks: HookMetadata[];
    warnings: string[];
    errors: Array<{ message: string; sourcePath?: string | null }>;
  }>;
};

export type InitializeResponse = Record<string, unknown>;

export type ReadOnlyCodexMethod =
  | "initialize"
  | "thread/list"
  | "thread/read"
  | "thread/loaded/list"
  | "hooks/list";

export const READ_ONLY_CODEX_METHODS: ReadonlySet<string> = new Set<ReadOnlyCodexMethod>([
  "initialize",
  "thread/list",
  "thread/read",
  "thread/loaded/list",
  "hooks/list"
]);

export function assertReadOnlyMethod(method: string): asserts method is ReadOnlyCodexMethod {
  if (!READ_ONLY_CODEX_METHODS.has(method)) {
    throw new Error(`CodexPigeon App Server client is read-only; method '${method}' is not allowed.`);
  }
}
