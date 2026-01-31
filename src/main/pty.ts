import * as pty from "node-pty";
import { BrowserWindow } from "electron";
import os from "os";

type PtyProcess = {
  pty: pty.IPty;
  id: string;
  cwd: string;
};

const shells = new Map<string, PtyProcess>();
let mainWindow: BrowserWindow | null = null;

export function setMainWindow(window: BrowserWindow | null) {
  mainWindow = window;
}

export function createPty(id: string, cwd: string): string {
  const shell = process.env.SHELL || (os.platform() === "win32" ? "powershell.exe" : "/bin/zsh");

  const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    },
  });

  ptyProcess.onData((data) => {
    if (mainWindow) {
      mainWindow.webContents.send("pty:data", { id, data });
    }
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    if (mainWindow) {
      mainWindow.webContents.send("pty:exit", { id, exitCode, signal });
    }
    shells.delete(id);
  });

  shells.set(id, { pty: ptyProcess, id, cwd });

  return id;
}

export function writePty(id: string, data: string): boolean {
  const shell = shells.get(id);
  if (!shell) return false;
  shell.pty.write(data);
  return true;
}

export function resizePty(id: string, cols: number, rows: number): boolean {
  const shell = shells.get(id);
  if (!shell) return false;
  shell.pty.resize(cols, rows);
  return true;
}

export function killPty(id: string): boolean {
  const shell = shells.get(id);
  if (!shell) return false;
  shell.pty.kill();
  shells.delete(id);
  return true;
}

export function killAllPty(): void {
  for (const [id, shell] of shells) {
    shell.pty.kill();
    shells.delete(id);
  }
}

export function getPtyIds(): string[] {
  return Array.from(shells.keys());
}
