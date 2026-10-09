import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fixtureRepo } from "./fixture.js";
import { listFrom } from "./list.js";
import { TOOLS, callTool, handleMessage } from "./mcp.js";
import { scanFiles } from "./scan.js";

const NOW = new Date("2026-10-09T12:00:00Z");
const PKG = fileURLToPath(new URL("..", import.meta.url));
const ctx = { cwd: PKG, now: () => NOW };

describe("tools", () => {
  it("two strict, namespaced tools, each with all four annotations", () => {
    expect(TOOLS.map((t) => t.name)).toEqual(["subprocessors_scan", "subprocessors_check"]);
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^subprocessors_[a-z_]+$/);
      expect(t.inputSchema.additionalProperties).toBe(false);
      expect(t.description.length).toBeGreaterThan(200);
      for (const [k, p] of Object.entries(t.inputSchema.properties))
        expect(String(p.description ?? ""), `${t.name}.${k}`).not.toBe("");
      expect(t.annotations).toEqual({
        title: t.title,
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
      expect(t.description).toMatch(/not legal advice|draft to review/i);
    }
  });

  it("scan returns the draft of a directory", async () => {
    const r = await callTool("subprocessors_scan", { path: "examples/demo-repo" }, ctx);
    expect(r.isError).toBe(false);
    const ids = (r.structured.subprocessors as { id: string }[]).map((x) => x.id);
    expect(ids).toContain("stripe");
    expect(r.structured.notice).toMatch(/not legal advice/);
  });

  it("check compares with a list, and reports added vendors", async () => {
    const root = fixtureRepo({
      "package.json": JSON.stringify({ dependencies: { stripe: "1", resend: "1" } }),
      "subprocessors.json": JSON.stringify(
        listFrom(
          scanFiles([{ path: "package.json", text: '{"dependencies":{"stripe":"1"}}' }], {
            shown: ".",
            now: NOW,
          }),
        ),
      ),
    });
    const r = await callTool("subprocessors_check", { path: root }, ctx);
    expect(r.isError).toBe(false);
    expect((r.structured.added as { id: string }[]).map((x) => x.id)).toEqual(["resend"]);
  });

  it("refuses bad input with code, cause, fix and retryable", async () => {
    for (const [name, args] of [
      ["subprocessors_scan", { nope: 1 }],
      ["subprocessors_scan", { include_tests: "yes" }],
      ["subprocessors_scan", "x"],
      ["subprocessors_check", { base: "--output=/x" }],
      ["subprocessors_check", { base: "main", list: "a.json" }],
    ] as const) {
      const r = await callTool(name, args, ctx);
      expect(r.isError, JSON.stringify(args)).toBe(true);
      expect(r.structured).toEqual({
        code: "INVALID_INPUT",
        cause: expect.any(String),
        fix: expect.any(String),
        retryable: false,
      });
    }
    const missing = await callTool("subprocessors_scan", { path: "no/such/dir" }, ctx);
    expect(missing.structured.code).toBe("DIR_NOT_FOUND");
  });
});

describe("protocol", () => {
  it("initialize, tools/list, tools/call, unknown methods and notifications", async () => {
    const init = (await handleMessage(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
      ctx,
    )) as {
      result: { protocolVersion: string; serverInfo: { name: string }; instructions: string };
    };
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect(init.result.serverInfo.name).toBe("subprocessors");
    expect(init.result.instructions).toMatch(/not legal advice/);
    const list = (await handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" }, ctx)) as {
      result: { tools: unknown[] };
    };
    expect(list.result.tools).toHaveLength(2);
    const call = (await handleMessage(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "subprocessors_scan", arguments: { path: "examples/demo-repo" } },
      },
      ctx,
    )) as {
      result: {
        content: { text: string }[];
        structuredContent: { tool: string };
        isError: boolean;
      };
    };
    expect(call.result.isError).toBe(false);
    expect(call.result.structuredContent.tool).toBe("subprocessors");
    expect(JSON.parse(call.result.content[0]!.text)).toEqual(call.result.structuredContent);
    expect(await handleMessage({ jsonrpc: "2.0", id: 4, method: "nope" }, ctx)).toMatchObject({
      error: { code: -32601 },
    });
    expect(
      await handleMessage(
        { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "x" } },
        ctx,
      ),
    ).toMatchObject({ error: { code: -32602 } });
    expect(
      await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx),
    ).toBeUndefined();
    expect(await handleMessage({ id: 6 }, ctx)).toMatchObject({ error: { code: -32600 } });
  });
});
