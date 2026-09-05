import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { TerminalSession } from "./use-terminal";

interface TerminalViewProps {
  session: TerminalSession;
}

/** Mounts an xterm terminal bound to a backend exec session. */
export function TerminalView({ session }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const writtenRef = useRef(0);
  const writeRef = useRef(session.write);

  useEffect(() => {
    writeRef.current = session.write;
  }, [session.write]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontSize: 12,
      theme: {
        background: "#09090b",
        foreground: "#e4e4e7",
        cursor: "#38bdf8",
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);
    fit.fit();

    terminalRef.current = terminal;
    fitRef.current = fit;
    writtenRef.current = 0;

    const dataDisposable = terminal.onData((data) => {
      writeRef.current(data);
    });
    const resizeObserver = new ResizeObserver(() => {
      fitRef.current?.fit();
    });
    resizeObserver.observe(container);

    return () => {
      dataDisposable.dispose();
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const fresh = session.output.slice(writtenRef.current);
    if (fresh) {
      terminal.write(fresh);
      writtenRef.current = session.output.length;
    }
  }, [session.output]);

  return <div ref={containerRef} className="h-full w-full" />;
}
