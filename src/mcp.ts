/**
 * `subprocessors mcp`: a local MCP server over stdio with two tools, so an agent can answer "which
 * vendors does this code send data to, and did this change add one?" from the user's own files.
 *
 * Implemented here rather than on the MCP SDK so the package has no runtime dependencies. It
 * speaks the initialize-based protocol revisions (2025-11-25, 2025-06-18, 2025-03-26, 2024-11-05):
 * newline-delimited JSON-RPC on stdin/stdout, `initialize`, `ping`, `tools/list`, `tools/call`.
 * Any other method answers -32601. Nothing but protocol goes to stdout.
 *
 * Both tools only read files on this machine (and, for `base`, run `git archive` into a temporary
 * directory). They make no requests. What they return goes to the agent's model provider like any
 * tool result: vendor names, file paths, line numbers, package names and env variable names.
 * Never an env value: real env files are never opened.
 */
import { createInterface } from "node:readline";
import { CATALOG } from "./catalog.js";
import { CliError } from "./errors.js";
import type { Exec } from "./git.js";
import { HANDOFF_LINE } from "./handoff.js";
import { check, scanPath } from "./main.js";
import { DRAFT_NOTICE } from "./scan.js";
import { version } from "./version.js";

export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, Record<string, unknown>>;
    required?: string[];
    additionalProperties: false;
  };
  annotations: {
    title: string;
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
}

const PATH = {
  type: "string",
  minLength: 1,
  maxLength: 1000,
  description:
    "The directory holding the code (a repository or one app in a monorepo), absolute or relative to where the server was started. Omitted: the directory the server was started in.",
};

export const TOOLS: readonly ToolDefinition[] = [
  {
    name: "subprocessors_scan",
    title: "Draft the sub-processor list from this code",
    description: `Reads a codebase on this machine and drafts its GDPR Art. 28 sub-processor list: every vendor the code shows it sends data to (hosting, databases, payments, email, LLM APIs, error monitoring, analytics, auth and more, from a catalog of ${CATALOG.vendors.length}), each with its purpose, a guess at the personal data it receives, the region where the code says it (vercel.json regions, Fly's primary region, a Terraform region), the vendor's DPA and its own sub-processor list, and the file and line each row was detected from. It reads package.json and other manifests, imports, API hosts in code, env variable names (never values; real .env files are never opened) and infrastructure files (vercel.json, wrangler.toml, Terraform, workflows). Vendors that are usually not sub-processors (GitHub for CI and sign-in) come apart in probably_not. Use it when someone needs a sub-processor list, a DPA annex or a trust-page table, or asks which third parties get their users' data. ${DRAFT_NOTICE} It cannot see vendors used outside the code (workspace, CRM, support desk, payroll). Makes no requests. Every result ends with a note that a hosted, dated list with customer notices is not built: "${HANDOFF_LINE}"`,
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        include_tests: {
          type: "boolean",
          description:
            "true: also read tests, fixtures and examples below path (a mocked SDK there would show as a vendor). Omitted: false.",
        },
      },
      additionalProperties: false,
    },
    annotations: {
      title: "Draft the sub-processor list from this code",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "subprocessors_check",
    title: "Did this change add a sub-processor?",
    description:
      "Compares the vendors a codebase uses now with its committed list (subprocessors.json, or the file in `list`) or with the same code at a git ref (`base`, e.g. origin/main, read with git archive into a temporary directory). Returns `added`: vendors the code now uses that the list or the base did not have, each with the file and line that brought it in and its DPA; `added_named`: new vendors the code only names (env variable names, a dev dependency, a bare host), to confirm; `added_probably_not`: new vendors that are usually not sub-processors; `removed`: vendors no longer seen in the code. Adding a sub-processor means telling customers first (GDPR Art. 28(2); DPAs usually give 30 days to object, sometimes 14), so use it on a pull request or before a deploy that adds an SDK, an API call or a hosting provider. A draft to review, not legal advice. Makes no requests.",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        list: {
          type: "string",
          minLength: 1,
          maxLength: 1000,
          description:
            "The committed list to compare with, relative to where the server was started. Give this or base, not both. Both omitted: subprocessors.json in path.",
        },
        base: {
          type: "string",
          minLength: 1,
          maxLength: 200,
          pattern: "^[A-Za-z0-9_][A-Za-z0-9_./~^@{}-]*$",
          description:
            "A git ref to compare with: a branch, tag or commit (origin/main, HEAD~1, a sha). Give this or list, not both.",
        },
      },
      additionalProperties: false,
    },
    annotations: {
      title: "Did this change add a sub-processor?",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];

export interface McpContext {
  cwd?: string;
  exec?: Exec;
  now?: () => Date;
}

interface ToolError {
  code: string;
  cause: string;
  fix: string;
  retryable: boolean;
}

function invalid(cause: string, fix: string): never {
  throw new CliError({ code: "INVALID_INPUT", cause, fix, retryable: false });
}

function checkArgs(tool: ToolDefinition, raw: unknown): Record<string, unknown> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw))
    invalid(
      "arguments must be an object",
      `Pass { ${Object.keys(tool.inputSchema.properties).join("?, ")}? }.`,
    );
  const props = tool.inputSchema.properties;
  const a = raw as Record<string, unknown>;
  for (const [k, v] of Object.entries(a)) {
    const p = props[k];
    if (!p) invalid(`unknown argument \`${k}\``, `Use only: ${Object.keys(props).join(", ")}.`);
    if (v === undefined) continue;
    if (p.type === "boolean" && typeof v !== "boolean")
      invalid(`\`${k}\` must be true or false`, "Omit it, or pass a boolean.");
    if (p.type === "string") {
      if (
        typeof v !== "string" ||
        v.length < (p.minLength as number) ||
        v.length > (p.maxLength as number)
      )
        invalid(
          `\`${k}\` must be a string of ${String(p.minLength)} to ${String(p.maxLength)} characters`,
          "Omit it, or pass a string.",
        );
      if (typeof p.pattern === "string" && !new RegExp(p.pattern).test(v))
        invalid(`\`${k}\` does not match ${p.pattern}`, "Pass a git ref such as origin/main.");
    }
  }
  return a;
}

export async function callTool(
  name: string,
  rawArgs: unknown,
  ctx: McpContext = {},
): Promise<{ structured: Record<string, unknown>; isError: boolean }> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`unknown tool ${name}`);
  const now = ctx.now?.() ?? new Date();
  const cwd = ctx.cwd ?? process.cwd();
  try {
    const args = checkArgs(tool, rawArgs);
    const shown = typeof args.path === "string" ? args.path : ".";
    if (name === "subprocessors_scan") {
      const report = await scanPath(shown, cwd, now, args.include_tests === true);
      return { structured: report as unknown as Record<string, unknown>, isError: false };
    }
    if (args.list !== undefined && args.base !== undefined)
      invalid("give list or base, not both", "Pass list for a committed file, or base for a ref.");
    const result = await check(shown, cwd, now, {
      list: args.list as string | undefined,
      base: args.base as string | undefined,
      exec: ctx.exec,
    });
    return { structured: result as unknown as Record<string, unknown>, isError: false };
  } catch (err) {
    const body: ToolError =
      err instanceof CliError
        ? err.toJSON()
        : {
            code: "INTERNAL",
            cause: err instanceof Error ? err.message : String(err),
            fix: "Run subprocessors on the same directory in a terminal to see the error with its context, and report it at https://github.com/agentwares/subprocessors/issues.",
            retryable: false,
          };
    return { structured: { ...body }, isError: true };
  }
}

interface Request {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

const INSTRUCTIONS =
  "subprocessors drafts a GDPR Art. 28 sub-processor list from a codebase on this machine (vendors, purposes, data guesses, regions, DPA links, and the file and line each was detected from) and checks whether a change added a vendor, which means telling customers first. Read-only, no requests. A draft to review, not legal advice.";

export async function handleMessage(msg: unknown, ctx: McpContext): Promise<unknown> {
  if (Array.isArray(msg)) {
    const out = (await Promise.all(msg.map((m) => handleMessage(m, ctx)))).filter(
      (r) => r !== undefined,
    );
    return out.length ? out : undefined;
  }
  const req = (msg && typeof msg === "object" ? msg : {}) as Request;
  const hasId = "id" in req && (typeof req.id === "string" || typeof req.id === "number");
  const id = hasId ? req.id : null;
  const error = (code: number, message: string) => ({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });
  if (!("method" in req) && ("result" in req || "error" in req)) return undefined;
  if (req.jsonrpc !== "2.0" || typeof req.method !== "string")
    return hasId || !("method" in req) ? error(-32600, "Invalid Request") : undefined;
  if (!hasId) return undefined; // notifications
  const params = (req.params && typeof req.params === "object" ? req.params : {}) as Record<
    string,
    unknown
  >;
  switch (req.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = (PROTOCOL_VERSIONS as readonly string[]).includes(asked)
        ? asked
        : PROTOCOL_VERSIONS[0];
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "subprocessors", title: "subprocessors", version: version() },
          instructions: INSTRUCTIONS,
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
    case "tools/call": {
      const name = params.name;
      if (typeof name !== "string" || !TOOLS.some((t) => t.name === name))
        return error(
          -32602,
          `Unknown tool: ${String(name)}. Tools: ${TOOLS.map((t) => t.name).join(", ")}`,
        );
      const { structured, isError } = await callTool(name, params.arguments, ctx);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(structured) }],
          structuredContent: structured,
          isError,
        },
      };
    }
    default:
      return error(-32601, `Method not found: ${req.method}`);
  }
}

/** Serve on stdin/stdout until stdin closes. */
export async function serveStdio(ctx: McpContext = {}): Promise<void> {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        }) + "\n",
      );
      continue;
    }
    try {
      const res = await handleMessage(msg, ctx);
      if (res !== undefined) process.stdout.write(JSON.stringify(res) + "\n");
    } catch (err) {
      process.stderr.write(
        `subprocessors mcp: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
}
