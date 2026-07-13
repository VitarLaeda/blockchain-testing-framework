import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parseUnits } from "ethers";
import { z } from "zod";

const DEFAULT_CHAIN_ID = 31337;

export const DECIMAL_AMOUNT_PATTERN = /^(?:\d+)(?:\.\d{1,18})?$/;

export const INVALID_AMOUNT_MESSAGE =
  "Invalid amount: expected a non-negative decimal string with up to 18 fractional digits with no exponent, sign, or whitespace.";

export const OUT_OF_RANGE_AMOUNT_MESSAGE = "Amount is out of supported range";

const CHAIN_METADATA: Record<
  number,
  { network: string; rpcProtocol: string; nativeCurrency: string }
> = {
  [DEFAULT_CHAIN_ID]: {
    network: "hardhat",
    rpcProtocol: "JSON-RPC 2.0",
    nativeCurrency: "ETH",
  },
};

const amountInputSchema = z
  .string()
  .regex(DECIMAL_AMOUNT_PATTERN, INVALID_AMOUNT_MESSAGE)
  .describe(
    "Decimal ether amount as a string, for example 1 or 1.5, with up to 18 fractional digits.",
  );

export function createBlockchainMcpServer(): McpServer {
  const server = new McpServer(
    { name: "blockchain-mcp-server", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "get_chain_metadata",
    {
      description:
        "Returns static metadata for a supported blockchain network, including chain id, network name, RPC protocol, and native currency symbol.",
      inputSchema: {
        chainId: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe(
            "Optional chain id to describe. Defaults to 31337 (Hardhat).",
          ),
      },
    },
    async ({ chainId }) => {
      const resolvedChainId = chainId ?? DEFAULT_CHAIN_ID;
      const metadata = CHAIN_METADATA[resolvedChainId];

      if (!metadata) {
        throw new Error(`Unsupported chain id: ${resolvedChainId}`);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              chainId: resolvedChainId,
              ...metadata,
            }),
          },
        ],
      };
    },
  );

  server.registerTool(
    "to_wei",
    {
      description:
        "Converts a decimal ether amount string to its exact 18-decimal wei representation. Accepts whole numbers or up to 18 fractional digits without signs, exponents, or whitespace.",
      inputSchema: {
        amount: amountInputSchema,
      },
    },
    async ({ amount }) => {
      try {
        const wei = parseUnits(amount, 18);
        return {
          content: [
            {
              type: "text" as const,
              text: wei.toString(),
            },
          ],
        };
      } catch {
        throw new Error(OUT_OF_RANGE_AMOUNT_MESSAGE);
      }
    },
  );

  return server;
}
