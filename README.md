# js-test-framework-model

An educational **Hardhat 3** and **TypeScript** project demonstrating three automated-test modules: local Solidity contract tests, JSON-RPC integration tests, and blockchain MCP server tests. The test run uses two reporters through `mocha-multi-reporters`: `spec` prints the complete test tree, steps, and summary in the terminal, while `allure-mocha` stores results for the HTML report. Each test is divided into `step(...)` calls with parameters such as addresses, amounts, RPC methods, and results; they are visible in both the terminal and the report.

The `Counter` contract provides a counter and a minimal token: owner-only `mint` and `transfer(from, to, amount)`, which transfers a balance between addresses. The JSON-RPC module can call these methods directly through `eth_sendTransaction` and `eth_call`.

## Requirements

- **Node.js** >= 22 (see `engines` in `package.json`)
- **npm** (included with Node.js)
- **Java** (JRE 8+) only to generate the Allure report (`npm run report`), not to run tests

## Installation

```bash
npm install
```

## Quick start

```bash
npm run compile
npm test
npm run report
```

The report is a multi-file HTML application; do **not** open `index.html` directly via `file://`, because the browser will block resource loading. To view it locally:

```bash
REPORT_OPEN=true npm run report
```

```powershell
$env:REPORT_OPEN="true"; npm run report
```

`allure open` starts a local HTTP server and **blocks** the terminal until it is stopped with Ctrl+C. In CI, upload `reports/allure-report/` as an artifact and open it through the pipeline HTTP viewer.

After `npm run report`, stdout includes `REPORT_INDEX=<absolute path>`. The `reports/` directory is in `.gitignore`, so its artifacts are not committed.

## Test modules

| Module | Command | Coverage |
|--------|---------|----------|
| Contracts | `npm run test:contracts` | 12 `Counter` tests on a local Hardhat EDR network: fixtures, increment/reset, `mint`, `transfer(from, to)`, custom errors (`Unauthorized`, `InvalidAddress`, `InsufficientBalance`), and events |
| JSON-RPC | `npm run test:rpc` | A lifecycle runner starts a local Hardhat node and runs `RpcClient` against a canonical URL; URL validation, malformed error envelopes, and `mint`/`transfer` calls through `eth_sendTransaction` and `eth_call` |
| MCP | `npm run test:mcp` | Official MCP SDK with in-memory transport and the `get_chain_metadata` and `to_wei` tools |
| All modules | `npm test` | Runs contracts → RPC → MCP in sequence |

For details, see [docs/contract-tests.md](docs/contract-tests.md), [docs/rpc-tests.md](docs/rpc-tests.md), and [docs/mcp-tests.md](docs/mcp-tests.md).

## npm scripts

| Script | Purpose |
|--------|---------|
| `compile` | `hardhat compile` — compiles Solidity |
| `test:contracts` | Mocha: `test/contracts/Counter.test.ts` |
| `test:rpc` | `node scripts/run-rpc-tests.mjs` — starts a node and runs RPC tests |
| `test:mcp` | Mocha: `test/mcp/BlockchainMcpServer.test.ts` |
| `test` | Runs all three modules |
| `coverage` | Contract-test coverage (`--coverage`) |
| `gas` | Contract-test gas statistics → `reports/gas-stats.json` |
| `report` | `node scripts/generate-report.mjs` — HTML from `reports/allure-results` |
| `clean` | `hardhat clean` |

Reporting details: [docs/reporting.md](docs/reporting.md).

## Project structure

```
contracts/          # Solidity (Counter.sol)
src/
  rpc/              # RpcClient
  mcp/              # BlockchainMcpServer, McpTestClient
test/
  contracts/        # Counter.test.ts
  rpc/              # RpcClient.test.ts
  mcp/              # BlockchainMcpServer.test.ts
scripts/
  run-rpc-tests.mjs # RPC lifecycle runner
  generate-report.mjs
reports/            # allure-results, allure-report, gas-stats (gitignored)
hardhat.config.ts   # spec + allure-mocha (mocha-multi-reporters) → reports/allure-results
test/support/       # reporting.ts — step(...) wrapper with parameters and terminal logging
```

## Environment variables

| Variable | Used by | Default |
|----------|---------|---------|
| `RPC_HOST` | `test:rpc` runner | `127.0.0.1` (loopback only) |
| `RPC_PORT` | `test:rpc` runner | `8545` |
| `RPC_STARTUP_TIMEOUT_MS` | node startup timeout | `30000` |
| `RPC_URL` | Direct `RpcClient.test.ts` execution | **Required** for a direct run; the runner sets it itself |
| `REPORT_OPEN` | `npm run report` | Generate only by default; `true` after trim/lowercase, such as `TRUE` or ` true `, runs `allure open` after generation and blocks until Ctrl+C. Any other value only generates the report. Set it in `.env` or the process environment; the caller's environment takes precedence over `.env`. |

The `.env` file is loaded by `dotenv` in `hardhat.config.ts` and `scripts/generate-report.mjs`. Do not commit secrets.

## Security

- The RPC runner accepts only loopback hosts: `127.0.0.1`, `localhost`, and `::1`.
- MCP tests use in-memory transport, without Cursor, wallets, private keys, or external RPC.
- Contract tests run on a simulated local Hardhat network.
- `reports/` and `.env` are listed in `.gitignore`.

## Documentation

- [Contract tests](docs/contract-tests.md)
- [JSON-RPC tests](docs/rpc-tests.md)
- [MCP tests](docs/mcp-tests.md)
- [Allure reporting](docs/reporting.md)

## Troubleshooting

### `npm run report` has no results

```
Allure results not found in: <path>/reports/allure-results
No *-result.json files present. Run the test suites first to collect results:
  npm test
```

First run `npm test` (or individual `test:*` commands), then run `npm run report`.

### Java / Allure

Generating the report requires Java on `PATH`:

```bash
java -version
```

If Allure CLI generation fails, the script prints diagnostics with Java installation examples for Windows (`winget`), macOS (`brew`), and Debian/Ubuntu (`apt`), then exits with a nonzero status. The commands are examples; a new terminal may be required after installation. Result-directory access errors produce separate filesystem diagnostics without Java instructions. A global Allure installation is not needed; `allure-commandline` from `node_modules` is used.

### RPC: port is busy

The runner listens on `127.0.0.1:8545` by default. If the port is busy:

```bash
$env:RPC_PORT="8546"; npm run test:rpc
```

`RPC_HOST` must remain a loopback address.

### Node.js < 22

```bash
node -v
```

The project requires Node >= 22. Upgrade Node or use nvm/fnm.

### TypeScript

```bash
npx tsc --noEmit
```

This type-checks the project without emitting JavaScript.
