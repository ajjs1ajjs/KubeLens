import { describe, expect, it } from "vitest";
import {
  findResourceType,
  resourceApiVersion,
  resourcePlural,
  RESOURCE_GROUPS,
} from "./resource-types";

describe("resource-types", () => {
  it("defines core resource groups", () => {
    expect(RESOURCE_GROUPS.length).toBeGreaterThan(0);
    const kinds = RESOURCE_GROUPS.flatMap((g) => g.resources.map((r) => r.kind));
    expect(kinds).toContain("Pod");
    expect(kinds).toContain("Deployment");
    expect(kinds).toContain("Service");
  });

  it("finds a resource type by kind", () => {
    const pod = findResourceType("Pod");
    expect(pod?.version).toBe("v1");
    expect(pod?.namespaced).toBe(true);
    expect(findResourceType("Nope")).toBeUndefined();
  });

  it("computes apiVersion with group", () => {
    expect(resourceApiVersion(findResourceType("Deployment")!)).toBe("apps/v1");
    expect(resourceApiVersion(findResourceType("Pod")!)).toBe("v1");
  });

  it("pluralizes known kinds", () => {
    expect(resourcePlural("Pod")).toBe("pods");
    expect(resourcePlural("Deployment")).toBe("deployments");
    expect(resourcePlural("Service")).toBe("services");
  });
});
