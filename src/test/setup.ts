import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll } from "vitest";
import "./jsdom-shims";
import i18n from "@/i18n";

// Ensure translations resolve synchronously in tests (default init is async).
beforeAll(() => {
  if (!i18n.isInitialized) {
    i18n.init({ initAsync: false, lng: "en" });
  }
});

afterEach(() => {
  cleanup();
});
