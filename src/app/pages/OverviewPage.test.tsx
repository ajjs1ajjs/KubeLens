import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OverviewPage } from "./OverviewPage";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <OverviewPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OverviewPage", () => {
  it("renders the welcome heading", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /welcome to kubelens/i })).toBeInTheDocument();
  });

  it("lists planned features", () => {
    renderPage();
    expect(screen.getByText("Resource browser")).toBeInTheDocument();
    expect(screen.getByText("Helm")).toBeInTheDocument();
  });

  it("shows a reload kubeconfig action", () => {
    renderPage();
    expect(screen.getByRole("button", { name: /reload kubeconfig/i })).toBeInTheDocument();
  });
});
