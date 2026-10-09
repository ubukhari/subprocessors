// A test that mocks another provider: tests are not read by default, so OpenAI is not a vendor here.
import OpenAI from "openai";
import { expect, it, vi } from "vitest";

vi.mock("openai");

it("is a mock", () => {
  expect(OpenAI).toBeDefined();
});
