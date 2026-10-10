import { contextBridge, ipcRenderer } from "electron";

const api = {
  selectWorkspace: () =>
    ipcRenderer.invoke("workspace:select") as Promise<string | null>,
  getMailboxSnapshot: (workspace: string) =>
    ipcRenderer.invoke("mailbox:snapshot", workspace),
  validateMessage: (body: string) =>
    ipcRenderer.invoke("mailbox:validate", body),
  sendMessage: (workspace: string, input: unknown, allowWarnings: boolean) =>
    ipcRenderer.invoke("mailbox:send", workspace, input, allowWarnings),
  listAutomations: (workspace: string) =>
    ipcRenderer.invoke("automation:list", workspace),
  createAutomation: (workspace: string, input: unknown) =>
    ipcRenderer.invoke("automation:create", workspace, input),
  stopAutomation: (workspace: string, automationId: string) =>
    ipcRenderer.invoke("automation:stop", workspace, automationId),
  watchMailbox: (workspace: string) =>
    ipcRenderer.invoke("mailbox:watch", workspace),
  unwatchMailbox: () => ipcRenderer.invoke("mailbox:unwatch"),
  previewInstall: (workspace: string) =>
    ipcRenderer.invoke("install:preview", workspace),
  inspectInstall: (workspace: string) =>
    ipcRenderer.invoke("install:status", workspace),
  applyInstall: (workspace: string) =>
    ipcRenderer.invoke("install:apply", workspace),
  listThreads: () => ipcRenderer.invoke("codex:threads"),
  listHooks: (workspace: string) =>
    ipcRenderer.invoke("codex:hooks", workspace),
  onMailboxSnapshot: (callback: (snapshot: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: unknown) =>
      callback(snapshot);
    ipcRenderer.on("mailbox:snapshot", listener);
    return () => {
      ipcRenderer.off("mailbox:snapshot", listener);
    };
  },
  onCodexNotification: (callback: (notification: unknown) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      notification: unknown,
    ) => callback(notification);
    ipcRenderer.on("codex:notification", listener);
    return () => {
      ipcRenderer.off("codex:notification", listener);
    };
  },
  onAutomationChanged: (callback: (automations: unknown) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      automations: unknown,
    ) => callback(automations);
    ipcRenderer.on("automation:changed", listener);
    return () => {
      ipcRenderer.off("automation:changed", listener);
    };
  },
  onAutomationError: (callback: (error: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, error: unknown) =>
      callback(error);
    ipcRenderer.on("automation:error", listener);
    return () => {
      ipcRenderer.off("automation:error", listener);
    };
  },
};

contextBridge.exposeInMainWorld("codexpigeon", api);

export type CodexPigeonDesktopApi = typeof api;
