import { useCallback, useEffect, useRef, useState } from "react";
import { k8sApi, subscribeExecOutput } from "@/lib/k8s/api";
import type { ResourceContext } from "@/lib/k8s/types";

export interface TerminalSession {
  id: string;
  /** Text emitted by the pod so far. */
  output: string;
  status: "connecting" | "open" | "closed";
  error: string | null;
  write: (data: string) => void;
  close: () => void;
}

/**
 * Manages a single exec terminal session: starts it via the backend, forwards
 * typed input, and accumulates pod output emitted as `kubelens://exec-output`
 * events.
 */
export function useTerminal(
  ctx: ResourceContext | null,
  name: string,
  container?: string,
  command?: string[],
  nonce = 0,
): TerminalSession | null {
  const [session, setSession] = useState<TerminalSession | null>(null);
  const unlisten = useRef<(() => void) | null>(null);
  const outputRef = useRef("");
  const idRef = useRef<string | null>(null);
  const statusRef = useRef<TerminalSession["status"]>("connecting");

  const close = useCallback(() => {
    const id = idRef.current;
    idRef.current = null;
    unlisten.current?.();
    unlisten.current = null;
    if (id) void k8sApi.stopExec(id);
    setSession(null);
  }, []);

  useEffect(() => {
    if (!ctx) {
      setSession(null);
      return;
    }
    let disposed = false;
    outputRef.current = "";
    statusRef.current = "connecting";

    setSession({
      id: "connecting",
      output: "",
      status: "connecting",
      error: null,
      write: (data) => {
        if (idRef.current) void k8sApi.execInput(idRef.current, data);
      },
      close,
    });

    void (async () => {
      try {
        const id = await k8sApi.execShell(ctx, name, container, command);
        if (disposed) {
          void k8sApi.stopExec(id);
          return;
        }
        idRef.current = id;
        unlisten.current = await subscribeExecOutput(id, (event) => {
          if (event.action === "output" && event.data !== undefined) {
            outputRef.current += event.data;
            if (!disposed && statusRef.current !== "closed") {
              setSession((s) => (s ? { ...s, output: outputRef.current } : s));
            }
          }
          if (event.action === "error") {
            statusRef.current = "closed";
            if (!disposed) {
              setSession((s) =>
                s ? { ...s, status: "closed", error: event.error ?? "session failed" } : s,
              );
            }
          }
          if (event.action === "done") {
            statusRef.current = "closed";
            if (!disposed) {
              setSession((s) => (s ? { ...s, status: "closed" } : s));
            }
          }
        });
        if (!disposed) {
          statusRef.current = "open";
          setSession((s) =>
            s ? { ...s, id, status: "open", write: (data) => void k8sApi.execInput(id, data) } : s,
          );
        }
      } catch (error) {
        statusRef.current = "closed";
        if (!disposed) {
          setSession((s) => (s ? { ...s, status: "closed", error: String(error) } : s));
        }
      }
    })();

    return () => {
      disposed = true;
      unlisten.current?.();
      unlisten.current = null;
      const id = idRef.current;
      idRef.current = null;
      if (id) void k8sApi.stopExec(id);
    };
  }, [ctx, name, container, command, nonce, close]);

  return session;
}
