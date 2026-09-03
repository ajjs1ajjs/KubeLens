import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useUpdate } from "./use-update";
import { useClusterStore } from "@/features/clusters/cluster-store";

const mockCheck = vi.fn();
const mockDownloadAndInstall = vi.fn();
const mockOpenUrl = vi.fn();

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: () => mockCheck(),
  Update: class {
    version = "0.2.0";
    downloadAndInstall = () => mockDownloadAndInstall();
  },
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: (url: string) => mockOpenUrl(url),
}));

function withConnectedCluster(connected: boolean) {
  useClusterStore.setState({
    clusters: [
      {
        id: "c1",
        name: "ctx-a",
        server: "https://cluster",
        namespace: "default",
        current: true,
        connected,
        version: "v1.30.0",
      },
    ],
    activeClusterId: connected ? "c1" : null,
  });
}

describe("useUpdate", () => {
  beforeEach(() => {
    mockCheck.mockReset();
    mockDownloadAndInstall.mockReset();
    mockOpenUrl.mockReset();
    useClusterStore.setState({ clusters: [], activeClusterId: null });
  });

  it("reports an available update", async () => {
    withConnectedCluster(true);
    mockCheck.mockResolvedValue({ version: "0.2.0" });

    const { result } = renderHook(() => useUpdate());
    await waitFor(() => expect(result.current.status).toBe("available"));
    expect(result.current.version).toBe("0.2.0");
  });

  it("reports up-to-date when check returns null", async () => {
    withConnectedCluster(true);
    mockCheck.mockResolvedValue(null);

    const { result } = renderHook(() => useUpdate());
    await waitFor(() => expect(result.current.status).toBe("up-to-date"));
  });

  it("checks for updates even when no cluster is connected", async () => {
    mockCheck.mockResolvedValue(null);

    const { result } = renderHook(() => useUpdate());
    await waitFor(() => expect(result.current.status).toBe("up-to-date"));
    expect(mockCheck).toHaveBeenCalledTimes(1);
  });

  it("installs the update and resets status", async () => {
    withConnectedCluster(true);
    mockCheck.mockResolvedValue({ version: "0.2.0", downloadAndInstall: mockDownloadAndInstall });
    mockDownloadAndInstall.mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdate());
    await waitFor(() => expect(result.current.status).toBe("available"));

    act(() => {
      result.current.installUpdate();
    });
    await waitFor(() => expect(mockDownloadAndInstall).toHaveBeenCalled());
    await waitFor(() => expect(result.current.status).toBe("idle"));
  });

  it("surfaces errors from the check", async () => {
    withConnectedCluster(true);
    mockCheck.mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useUpdate());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toContain("offline");
  });

  it("surfaces signature-verification failures as an error instead of silently reverting", async () => {
    withConnectedCluster(true);
    mockCheck.mockResolvedValue({
      version: "0.3.0",
      downloadAndInstall: mockDownloadAndInstall,
    });
    mockDownloadAndInstall.mockRejectedValue(new Error("invalid signature"));

    const { result } = renderHook(() => useUpdate());
    await waitFor(() => expect(result.current.status).toBe("available"));

    await act(async () => {
      await result.current.installUpdate();
    });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toContain("invalid signature");
  });

  it("opens the release page on GitHub for the detected version", async () => {
    withConnectedCluster(true);
    mockCheck.mockResolvedValue({ version: "0.3.0" });

    const { result } = renderHook(() => useUpdate());
    await waitFor(() => expect(result.current.status).toBe("available"));

    await act(async () => {
      await result.current.openReleasePage();
    });

    expect(mockOpenUrl).toHaveBeenCalledWith(
      "https://github.com/ajjs1ajjs/KubeLens/releases/tag/v0.3.0",
    );
  });
});
