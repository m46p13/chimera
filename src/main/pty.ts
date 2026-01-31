import * as pty from "node-pty";
import { BrowserWindow } from "electron";
import os from "os";

type PtyProcess = {
  pty: pty.IPty;
  id: string;
  cwd: string;
  // Store event handlers for proper cleanup
  dataHandler: (data: string) => void;
  exitHandler: ({ exitCode, signal }: { exitCode: number; signal?: number }) => void;
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

  // Create stable event handlers
  const dataHandler = (data: string) => {
    if (mainWindow) {
      mainWindow.webContents.send("pty:data", { id, data });
    }
  };

  const exitHandler = ({ exitCode, signal }: { exitCode: number; signal?: number }) => {
    if (mainWindow) {
      mainWindow.webContents.send("pty:exit", { id, exitCode, signal });
    }
    // Clean up from shells map
    shells.delete(id);
  };

  ptyProcess.onData(dataHandler);
  ptyProcess.onExit(exitHandler);

  shells.set(id, { pty: ptyProcess, id, cwd, dataHandler, exitHandler });

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
  
  // Kill the PTY process - the exit handler will handle cleanup
  shell.pty.kill();
  // Remove from shells map immediately
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
