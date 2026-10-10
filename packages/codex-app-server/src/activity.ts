import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CodexLogActivity = {
  threadId: string;
  lastSeenAt: number;
  sampleCount: number;
  source: "codex-logs";
  signal: "streaming";
};

type ActivityRow = {
  thread_id?: string;
  last_seen?: number;
  sample_count?: number;
};

export type CodexLogActivityOptions = {
  codexHome?: string;
  windowSeconds?: number;
  nowSeconds?: number;
};

export async function readRecentCodexLogActivity(
  options: CodexLogActivityOptions = {},
): Promise<Map<string, CodexLogActivity>> {
  const codexHome =
    options.codexHome ??
    process.env.CODEX_HOME ??
    path.join(os.homedir(), ".codex");
  const windowSeconds = Math.max(5, options.windowSeconds ?? 45);
  const nowSeconds = Math.floor(options.nowSeconds ?? Date.now() / 1000);
  const logsPath = path.join(codexHome, "logs_2.sqlite");
  const since = nowSeconds - windowSeconds;
  const sql = `
    SELECT thread_id, MAX(ts) AS last_seen, COUNT(*) AS sample_count
    FROM logs
    WHERE ts >= ${since}
      AND thread_id IS NOT NULL
      AND thread_id != ''
      AND feedback_log_body LIKE '%event.name="codex.websocket_event"%'
      AND (
        feedback_log_body LIKE '%response.output_text.delta%'
        OR feedback_log_body LIKE '%response.output_item.added%'
        OR feedback_log_body LIKE '%response.function_call_arguments.delta%'
      )
    GROUP BY thread_id
    ORDER BY last_seen DESC
    LIMIT 50;
  `;

  try {
    const { stdout } = await execFileAsync(
      "sqlite3",
      ["-json", logsPath, sql],
      {
        timeout: 1500,
        maxBuffer: 1024 * 1024,
      },
    );
    const rows = stdout.trim() ? (JSON.parse(stdout) as ActivityRow[]) : [];
    return new Map(
      rows
        .filter((row): row is Required<ActivityRow> =>
          Boolean(row.thread_id && row.last_seen),
        )
        .map((row) => [
          row.thread_id,
          {
            threadId: row.thread_id,
            lastSeenAt: Number(row.last_seen),
            sampleCount: Number(row.sample_count ?? 0),
            source: "codex-logs",
            signal: "streaming",
          },
        ]),
    );
  } catch {
    return new Map();
  }
}
