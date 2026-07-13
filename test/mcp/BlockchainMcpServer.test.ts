import { expect } from "chai";
import { epic, feature, story } from "allure-js-commons";
import {
  DECIMAL_AMOUNT_PATTERN,
  INVALID_AMOUNT_MESSAGE,
  OUT_OF_RANGE_AMOUNT_MESSAGE,
} from "../../src/mcp/BlockchainMcpServer.js";
import { createMcpTestSession } from "../../src/mcp/McpTestClient.js";
import { step } from "../support/reporting.js";

const HARDHAT_METADATA = {
  chainId: 31337,
  network: "hardhat",
  rpcProtocol: "JSON-RPC 2.0",
  nativeCurrency: "ETH",
};

// ethers parseUnits overflows at 136-digit whole-number strings (135 succeeds).
const OUT_OF_RANGE_AMOUNT = "9".repeat(136);

function extractTextContent(content: unknown): string {
  expect(content).to.be.an("array").that.is.not.empty;
  const textItem = (content as Array<{ type: string; text?: string }>).find(
    (item) => item.type === "text",
  );
  expect(textItem?.text).to.be.a("string");
  return textItem!.text!;
}

function parseChainMetadata(text: string): typeof HARDHAT_METADATA {
  return JSON.parse(text) as typeof HARDHAT_METADATA;
}

function amountInputConstraint(inputSchema: unknown): { pattern?: string } {
  expect(inputSchema).to.be.an("object");
  const schema = inputSchema as {
    properties?: { amount?: { pattern?: string } };
  };
  expect(schema.properties?.amount).to.be.an("object");
  return schema.properties!.amount!;
}

describe("Blockchain MCP server", function () {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async function () {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  beforeEach(async function () {
    await epic("Model Context Protocol");
    await feature("Blockchain MCP tools");
  });

  describe("tool discovery", function () {
    it("lists both blockchain tools with schemas and descriptions", async function () {
      await story("tool discovery exposes get_chain_metadata and to_wei");

      const session = await step("Open MCP test session", () =>
        createMcpTestSession(),
      );
      cleanup = session.cleanup;

      const tools = await step(
        "List tools over the MCP protocol",
        { method: "tools/list" },
        async (ctx) => {
          const result = await session.client.listTools();
          await ctx.parameter(
            "tools",
            result.tools.map((tool) => tool.name).join(", "),
          );
          return result.tools;
        },
      );

      await step(
        "Both tools expose descriptions and input schemas",
        async () => {
          const toolNames = tools.map((tool) => tool.name);
          expect(toolNames).to.include("get_chain_metadata");
          expect(toolNames).to.include("to_wei");

          const chainMetadataTool = tools.find(
            (tool) => tool.name === "get_chain_metadata",
          );
          const toWeiTool = tools.find((tool) => tool.name === "to_wei");

          expect(chainMetadataTool?.description).to.be.a("string").that.is.not
            .empty;
          expect(toWeiTool?.description).to.be.a("string").that.is.not.empty;
          expect(chainMetadataTool?.inputSchema).to.be.an("object");
          expect(toWeiTool?.inputSchema).to.be.an("object");
        },
      );
    });

    it("advertises decimal grammar for to_wei amount input", async function () {
      await story("to_wei discovery schema exposes amount decimal pattern");

      const session = await step("Open MCP test session", () =>
        createMcpTestSession(),
      );
      cleanup = session.cleanup;

      await step(
        "to_wei amount schema advertises the decimal pattern",
        async () => {
          const { tools } = await session.client.listTools();
          const toWeiTool = tools.find((tool) => tool.name === "to_wei");
          const amountSchema = amountInputConstraint(toWeiTool?.inputSchema);

          expect(amountSchema.pattern).to.equal(DECIMAL_AMOUNT_PATTERN.source);
        },
      );
    });
  });

  describe("get_chain_metadata", function () {
    it("defaults to Hardhat metadata when chainId is omitted", async function () {
      await story("omitted chainId defaults to Hardhat network metadata");

      const session = await step("Open MCP test session", () =>
        createMcpTestSession(),
      );
      cleanup = session.cleanup;

      const result = await step(
        "Call get_chain_metadata without chainId",
        { tool: "get_chain_metadata", arguments: {} },
        (ctx) =>
          session.client
            .callTool({
              name: "get_chain_metadata",
              arguments: {},
            })
            .then(async (response) => {
              await ctx.parameter(
                "result",
                extractTextContent(response.content),
              );
              return response;
            }),
      );

      await step("Default metadata matches the Hardhat network", async () => {
        expect(result.isError).to.not.equal(true);
        expect(
          parseChainMetadata(extractTextContent(result.content)),
        ).to.deep.equal(HARDHAT_METADATA);
      });
    });

    it("rejects unsupported chain ids and recovers", async function () {
      await story(
        "unsupported chain ids return stable errors and server recovers",
      );

      const session = await step("Open MCP test session", () =>
        createMcpTestSession(),
      );
      cleanup = session.cleanup;

      await step(
        "Unsupported chainId 999 returns a stable error",
        { tool: "get_chain_metadata", chainId: 999 },
        async (ctx) => {
          const errorResult = await session.client.callTool({
            name: "get_chain_metadata",
            arguments: { chainId: 999 },
          });

          await ctx.parameter("isError", String(errorResult.isError));
          await ctx.parameter(
            "result",
            extractTextContent(errorResult.content),
          );
          expect(errorResult.isError).to.equal(true);
          expect(extractTextContent(errorResult.content)).to.equal(
            "Unsupported chain id: 999",
          );
        },
      );

      await step("Server still answers a valid request", async () => {
        const recoveryResult = await session.client.callTool({
          name: "get_chain_metadata",
          arguments: {},
        });

        expect(recoveryResult.isError).to.not.equal(true);
        expect(
          parseChainMetadata(extractTextContent(recoveryResult.content)),
        ).to.deep.equal(HARDHAT_METADATA);
      });
    });
  });

  describe("to_wei", function () {
    it("converts 1.5 ether to wei", async function () {
      await story("decimal ether amounts convert to exact wei strings");

      const session = await step("Open MCP test session", () =>
        createMcpTestSession(),
      );
      cleanup = session.cleanup;

      const result = await step(
        "Call to_wei with 1.5",
        { tool: "to_wei", amount: "1.5" },
        (ctx) =>
          session.client
            .callTool({
              name: "to_wei",
              arguments: { amount: "1.5" },
            })
            .then(async (response) => {
              await ctx.parameter(
                "result",
                extractTextContent(response.content),
              );
              return response;
            }),
      );

      await step("Result equals 1.5e18 wei", async () => {
        expect(result.isError).to.not.equal(true);
        expect(extractTextContent(result.content)).to.equal(
          "1500000000000000000",
        );
      });
    });

    it("accepts up to 18 fractional digits", async function () {
      await story("wei conversion supports the maximum 18 fractional digits");

      const session = await step("Open MCP test session", () =>
        createMcpTestSession(),
      );
      cleanup = session.cleanup;

      const result = await step(
        "Call to_wei with 18 fractional digits",
        { tool: "to_wei", amount: "0.123456789012345678" },
        (ctx) =>
          session.client
            .callTool({
              name: "to_wei",
              arguments: { amount: "0.123456789012345678" },
            })
            .then(async (response) => {
              await ctx.parameter(
                "result",
                extractTextContent(response.content),
              );
              return response;
            }),
      );

      await step("Full 18-digit precision is preserved", async () => {
        expect(result.isError).to.not.equal(true);
        expect(extractTextContent(result.content)).to.equal(
          "123456789012345678",
        );
      });
    });

    it("rejects out-of-range amounts with a stable conversion error", async function () {
      await story("oversized valid-format amounts return stable range errors");

      const session = await step("Open MCP test session", () =>
        createMcpTestSession(),
      );
      cleanup = session.cleanup;

      await step(
        "Oversized amount returns the stable range error",
        { tool: "to_wei", amountDigits: OUT_OF_RANGE_AMOUNT.length },
        async (ctx) => {
          const errorResult = await session.client.callTool({
            name: "to_wei",
            arguments: { amount: OUT_OF_RANGE_AMOUNT },
          });

          await ctx.parameter("isError", String(errorResult.isError));
          await ctx.parameter(
            "result",
            extractTextContent(errorResult.content),
          );
          expect(errorResult.isError).to.equal(true);
          expect(extractTextContent(errorResult.content)).to.equal(
            OUT_OF_RANGE_AMOUNT_MESSAGE,
          );
        },
      );
    });

    it("rejects invalid amounts through MCP tool errors without crashing", async function () {
      await story(
        "invalid amounts return structured tool errors and server stays usable",
      );

      const session = await step("Open MCP test session", () =>
        createMcpTestSession(),
      );
      cleanup = session.cleanup;

      await step(
        "Each invalid amount returns a structured tool error",
        { tool: "to_wei", amounts: ["1e3", "-1", "0.1234567890123456789"] },
        async () => {
          for (const invalidAmount of ["1e3", "-1", "0.1234567890123456789"]) {
            await step(
              "Invalid amount is rejected",
              { amount: invalidAmount },
              async (ctx) => {
                const errorResult = await session.client.callTool({
                  name: "to_wei",
                  arguments: { amount: invalidAmount },
                });

                await ctx.parameter("isError", String(errorResult.isError));
                await ctx.parameter(
                  "result",
                  extractTextContent(errorResult.content),
                );
                expect(errorResult.isError).to.equal(true);
                expect(extractTextContent(errorResult.content)).to.include(
                  INVALID_AMOUNT_MESSAGE,
                );
              },
            );
          }
        },
      );

      await step(
        "Server still converts a valid amount afterwards",
        async () => {
          const recoveryResult = await session.client.callTool({
            name: "to_wei",
            arguments: { amount: "1" },
          });

          expect(recoveryResult.isError).to.not.equal(true);
          expect(extractTextContent(recoveryResult.content)).to.equal(
            "1000000000000000000",
          );
        },
      );
    });
  });

  describe("session cleanup", function () {
    it("allows cleanup to be called twice safely", async function () {
      await story("session cleanup is idempotent and concurrency-safe");

      const session = await step("Open MCP test session", () =>
        createMcpTestSession(),
      );

      await step("Calling cleanup twice does not throw", async () => {
        await session.cleanup();
        await session.cleanup();
      });
    });
  });
});
