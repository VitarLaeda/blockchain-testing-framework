# MCP tests (Blockchain MCP Server)

This module tests `src/mcp/BlockchainMcpServer.ts` through the official **@modelcontextprotocol/sdk**: `McpServer`, `Client`, and **InMemoryTransport** (`createLinkedPair`). It is **not** the Cursor MCP runtime, **not** an external stdio/SSE server, and does **not** require a wallet, private keys, or a JSON-RPC endpoint.

The session is created by the `createMcpTestSession()` helper in `src/mcp/McpTestClient.ts`.

## Run

```bash
npm run test:mcp
```

Or run `npm test`, where this is the third stage.

## Server tools

| Name                 | Purpose                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| `get_chain_metadata` | Static network metadata: chain ID, network, rpcProtocol, and nativeCurrency |
| `to_wei`             | Converts a decimal ether string to wei with up to 18 fractional digits      |

## Request and response examples

Tests call `session.client.callTool({ name, arguments })`. The following are the SDK's actual response shapes.

### get_chain_metadata (success, default chain ID)

**Request:**

```json
{ "name": "get_chain_metadata", "arguments": {} }
```

**Response (`content[0].text` is a JSON string):**

```json
{
  "chainId": 31337,
  "network": "hardhat",
  "rpcProtocol": "JSON-RPC 2.0",
  "nativeCurrency": "ETH"
}
```

`isError` is not `true`.

### get_chain_metadata (unsupported chain ID)

**Request:**

```json
{ "name": "get_chain_metadata", "arguments": { "chainId": 999 } }
```

**Response:** `isError === true`, with text `Unsupported chain id: 999`.

### to_wei (success)

**Request:**

```json
{ "name": "to_wei", "arguments": { "amount": "1.5" } }
```

**Response:** `isError` is not `true`, with text `1500000000000000000`.

### to_wei (invalid amount)

**Request:**

```json
{ "name": "to_wei", "arguments": { "amount": "1e3" } }
```

**Response:** `isError === true`, with text containing:

```
Invalid amount: expected a non-negative decimal string with up to 18 fractional digits with no exponent, sign, or whitespace.
```

### to_wei (out of range)

**Request:** an `amount` containing 136 `9` digits. Its pattern is valid, but it does not fit in `parseUnits`.

**Response:** `isError === true`, with text `Amount is out of supported range`.

## Test coverage (nine scenarios)

- **tool discovery** — both tools are in `listTools()`, have non-empty descriptions and schemas, and the `amount` pattern matches `DECIMAL_AMOUNT_PATTERN`.
- **get_chain_metadata** — the default Hardhat response, an error for 999, and server recovery.
- **to_wei** — `1.5`, 18 fractional digits, out-of-range input, invalid input (`1e3`, `-1`, and one extra fractional digit), and recovery with `1`.
- **session cleanup** — calling `cleanup()` twice is safe.

## Test steps and Allure parameters

Each test is divided into steps through the `step(...)` wrapper from `test/support/reporting.ts`, such as `Open MCP test session`, `Call to_wei with 1.5`, and `List tools over the MCP protocol`. Step **parameters** include an MCP method name (`method=tools/list`), tool (`tool=to_wei` / `get_chain_metadata`), arguments (`amount`, `chainId`), and results (`result`, `isError`, and the tool list). They are visible in the report and printed in the terminal as `↳ <step> — key=value, …`.

## Allure labels

| epic                     | feature                |
| ------------------------ | ---------------------- |
| `Model Context Protocol` | `Blockchain MCP tools` |

Stories correspond to `it` blocks, for example `decimal ether amounts convert to exact wei strings`.

## Extending the suite

1. Register a tool in `createBlockchainMcpServer()` with `server.registerTool`.
2. Add metadata to `CHAIN_METADATA` when introducing a chain ID.
3. Add tests to `BlockchainMcpServer.test.ts` through `createMcpTestSession()`.
4. Always call `cleanup` in `afterEach` to close the client and server.

A new tool does not require changes in Cursor or `.cursor/mcp.json`; tests are isolated in memory.

## Troubleshooting failures

| Symptom                            | Cause                                      | Action                                              |
| ---------------------------------- | ------------------------------------------ | --------------------------------------------------- |
| `listTools` does not find the name | Tool was not registered or contains a typo | Check `registerTool`                                |
| `isError` is unexpected            | Zod or regex validation changed            | Compare `amountInputSchema` with the test           |
| Test hangs after completion        | `cleanup` was not called                   | Use `afterEach` with `session.cleanup()`            |
| SDK import errors                  | `@modelcontextprotocol/sdk` version issue  | Run `npm install` and verify `.js` paths in imports |

The transport is **InMemoryTransport.createLinkedPair()**: a real SDK transport, not mock HTTP or Cursor.
