# JSON-RPC tests (RpcClient)

This module tests `src/rpc/RpcClient.ts`: endpoint URL validation, JSON-RPC error-envelope parsing, transport and timeout handling, integration with a real Hardhat JSON-RPC node, and contract-method calls through raw JSON-RPC (`eth_sendTransaction`, `eth_call`, and `eth_getTransactionReceipt`).

The tests are split into two files:

- **`test/rpc/RpcClient.unit.test.ts`** — fast, node-independent unit tests driven by local HTTP stubs. Runnable without a Hardhat node.
- **`test/rpc/RpcClient.test.ts`** — integration tests that require a running Hardhat node (started by the runner).

## Files

- Client: `src/rpc/RpcClient.ts`
- Unit tests: `test/rpc/RpcClient.unit.test.ts`
- Integration tests: `test/rpc/RpcClient.test.ts`
- Runner: `scripts/run-rpc-tests.mjs`

## Run (recommended)

```bash
npm run test:rpc
```

This runs the unit tests first (`test:rpc:unit`, no node required) and then the integration tests (`test:rpc:integration`, via the runner):

- `npm run test:rpc:unit` — `hardhat test mocha test/rpc/RpcClient.unit.test.ts`
- `npm run test:rpc:integration` — `node scripts/run-rpc-tests.mjs`

The integration runner:

1. Reads `RPC_HOST` (default `127.0.0.1`) and `RPC_PORT` (default `8545`).
2. Validates that the host is loopback: `127.0.0.1`, `localhost`, or `::1`.
3. Builds a **canonical** URL, such as `http://127.0.0.1:8545` or `http://[::1]:8545` for IPv6.
4. Starts the child process `hardhat node --hostname <host> --port <port>`.
5. Waits for `eth_chainId === 0x7a69` with the `RPC_STARTUP_TIMEOUT_MS` timeout, 30 seconds by default.
6. Starts tests with an **explicit** `RPC_URL=<canonical URL>` in the child process environment, overriding any inherited `RPC_URL`.
7. Stops the node and test process in `finally`.

### Change the port

```powershell
$env:RPC_PORT="8546"
npm run test:rpc
```

```bash
RPC_PORT=8546 npm run test:rpc
```

## Run integration tests directly (without the runner)

```bash
# Terminal 1
npx hardhat node --hostname 127.0.0.1 --port 8545

# Terminal 2
$env:RPC_URL="http://127.0.0.1:8545"
npx hardhat test mocha test/rpc/RpcClient.test.ts
```

Without `RPC_URL`, the integration blocks fail with:

```
RPC_URL environment variable is required for Hardhat integration tests
```

## Unit scenarios (node-independent, HTTP stubs)

**URL validation** — `not-a-url` and `ftp://…` are rejected at construction; `http(s)://` endpoints are accepted.

**Successful responses**

- A well-formed response resolves with its `result`.
- An error envelope becomes a typed `RpcError` (with `code`, `message`, and optional `data`).
- An error envelope without `data` yields an `RpcError` whose `data` is `undefined`.

**Malformed responses** — each yields a descriptive `Error` (never a masked `RpcError`):

| Case                             | Expected message                      |
| -------------------------------- | ------------------------------------- |
| Non-object `error` (string)      | `malformed error envelope`            |
| Non-numeric `error.code`         | `error.code must be a finite number`  |
| Non-string `error.message`       | `error.message must be a string`      |
| HTTP status ≠ 2xx (503)          | `HTTP request failed with status 503` |
| Body is not valid JSON           | `not valid JSON`                      |
| Payload is not an object (array) | `must be a JSON object`               |
| `jsonrpc` ≠ `2.0`                | `invalid or missing jsonrpc version`  |
| Response `id` mismatch           | `id mismatch: expected 1, got 999`    |
| Neither `result` nor `error`     | `neither result nor error`            |

**Transport and timeout**

- A dropped connection propagates the transport error unchanged (not masked as a timeout).
- A slow full response times out (`timed out after 50ms`).
- A response whose **body** stalls after headers is aborted by the same timeout budget.

**Runner startup diagnostics** — `buildNodeStartupError` produces actionable `EADDRINUSE` (port) guidance and distinct signal-termination messages.

## Integration scenarios (require a running node)

**Hardhat node** (`eth_chainId`, `eth_blockNumber`, `eth_accounts` + `eth_getBalance`, unsupported method → `RpcError` code `-32004`).

**Counter over JSON-RPC** — deploy `Counter` via `eth_sendTransaction`, `increment()`, then read `value()` via `eth_call` (expects `1`).

**MiniToken over JSON-RPC**

| Test                   | RPC methods                                                            | Expectation                                                                        |
| ---------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Mint + transfer        | `eth_sendTransaction` (`mint`, `transfer`) + `eth_call` (`balanceOf`)  | Mint 1000 to the holder; holder transfers 400 to recipient; balances `600` / `400` |
| Approve + transferFrom | `eth_sendTransaction` (`mint`, `approve`, `transferFrom`) + `eth_call` | Spender moves 400 of the holder's tokens to the recipient                          |
| Over-balance transfer  | `eth_sendTransaction` (`transfer` beyond balance)                      | Transaction is rejected and the holder balance stays unchanged                     |

Calldata is encoded through `ethers.Interface`; bytecode is loaded from the compiled artifacts under `artifacts/contracts/`. Receipts are awaited by `waitForReceipt`, which polls `eth_getTransactionReceipt`.

## Test steps and Allure parameters

All tests use the `step(...)` wrapper from `test/support/reporting.ts`. Step **parameters** include the RPC method (`method=eth_sendTransaction` / `eth_call`), the contract method (`call=mint` / `transfer` / `transferFrom`), addresses (`from`, `to`, `spender`, `account`), amounts (`amount`, `allowance`), and results (`status`, `contractAddress`, `balanceOf(holder)`). They appear in the report and print in the terminal as `↳ <step> — key=value, …`.

## Allure labels

| Block                            | epic       | feature          |
| -------------------------------- | ---------- | ---------------- |
| Unit (URL, envelopes, transport) | `JSON-RPC` | `RpcClient unit` |
| Runner startup                   | `JSON-RPC` | `Runner startup` |
| Integration node checks          | `JSON-RPC` | `Hardhat node`   |
| Contract calls                   | `JSON-RPC` | `Contract calls` |

## Extending the suite

1. Add methods to `RpcClient`, such as batch requests, headers, or new helpers.
2. Add node-independent cases to `RpcClient.unit.test.ts` with HTTP stubs; add node-dependent cases to `RpcClient.test.ts`.
3. Integration tests must use `requireRpcUrl()`; do not hardcode a URL.
4. In CI, use `npm run test:rpc` rather than relying on an external `RPC_URL`.

## Troubleshooting failures

| Symptom                                           | Cause                                       | Resolution                                  |
| ------------------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| `Timed out ... waiting for Hardhat node`          | The node did not start or the port is wrong | Free the port or set `RPC_PORT`             |
| `RPC_HOST must be a loopback address`             | `RPC_HOST` is an external host              | Use only `127.0.0.1`, `localhost`, or `::1` |
| `RPC_PORT must be an integer between 1 and 65535` | Invalid port                                | Correct `RPC_PORT`                          |
| `RPC_URL environment variable is required`        | Direct integration run without the variable | Set `RPC_URL` or use `npm run test:rpc`     |
| EADDRINUSE                                        | Port 8545 is busy                           | `$env:RPC_PORT="8546"; npm run test:rpc`    |

The canonical URL with defaults is `http://127.0.0.1:8545`.
