import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { useTheme } from "next-themes";
import { ThemeProvider } from "@/components/theme-provider";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="kubelens-theme-test" disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}

describe("theme switching", () => {
  beforeEach(() => {
    try {
      window.localStorage?.clear();
    } catch {
      /* noop */
    }
    document.documentElement.className = "";
  });

  it("starts with dark theme applied", () => {
    renderHook(() => useTheme(), { wrapper });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("toggles to light and applies the class", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => {
      result.current.setTheme("light");
    });
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("toggles back to dark", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => {
      result.current.setTheme("dark");
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
