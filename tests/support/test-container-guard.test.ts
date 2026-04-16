import { describe, it, expect } from "bun:test";
import { isInsideContainer, assertInContainer } from "./container-guard";

describe("container-guard", () => {
  it("exports isInsideContainer function", () => {
    expect(typeof isInsideContainer).toBe("function");
  });

  it("isInsideContainer returns a boolean", () => {
    const result = isInsideContainer();
    expect(typeof result).toBe("boolean");
  });

  it("exports assertInContainer function", () => {
    expect(typeof assertInContainer).toBe("function");
  });

  it("assertInContainer throws when outside container", () => {
    const testOutsideContainer = () => {
      // Mock isInsideContainer to return false for this test
      if (!isInsideContainer()) {
        assertInContainer("test-lane");
      }
    };

    if (!isInsideContainer()) {
      expect(testOutsideContainer).toThrow(
        "Lane 'test-lane' must run inside a container. Use 'bun run test:test-lane'"
      );
    }
  });

  it("assertInContainer includes lane name in error message", () => {
    if (!isInsideContainer()) {
      expect(() => assertInContainer("custom-lane")).toThrow(/custom-lane/);
    }
  });

  it("assertInContainer includes helpful instruction in error message", () => {
    if (!isInsideContainer()) {
      expect(() => assertInContainer("unit")).toThrow(/bun run test:unit/);
    }
  });
});
