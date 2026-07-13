# JSON-RPC tests (RpcClient)

This module tests `src/rpc/RpcClient.ts`: endpoint URL validation, malformed JSON-RPC error-envelope parsing, integration with a real Hardhat JSON-RPC node, and contract-method calls (`mint` / `transfer`) through raw JSON-RPC (`eth_sendTransaction`, `eth_call`, and `eth_getTransactionReceipt`).

## Files

- Client: `src/rpc/RpcClient.ts`
- Tests: `test/rpc/RpcClient.test.ts`
- Runner: `scripts/run-rpc-tests.mjs`

## Run (recommended)

```bash
npm run test:rpc
```

**Important:** `npm run test:rpc` does **not** use an arbitrary `RPC_URL` from the user's environment. The runner:

1. Reads `RPC_HOST` (default `127.0.0.1`) and `RPC_PORT` (default `8545`).
2. Validates that the host is loopback: `127.0.0.1`, `localhost`, or `::1`.
3. Builds a **canonical** URL, such as `http://127.0.0.1:8545` or `http://[::1]:8545` for IPv6.
4. Starts the child process `hardhat node --hostname <host> --port <port>`.
5. Waits for `eth_chainId === 0x7a69` with the `RPC_STARTUP_TIMEOUT_MS` timeout, 30 seconds by default.
6. Starts tests with an **explicit** `RPC_URL=<canonical URL>` in the child process environment, overriding an inherited `RPC_URL`.
7. Stops the node and test process in `finally`.

An `RPC_URL` inherited from the shell is **ignored** in step 6. Tests only receive the URL built by the runner from `RPC_HOST` and `RPC_PORT`.

### Change the port

```powershell
$env:RPC_PORT="8546"
npm run test:rpc
```

```bash
RPC_PORT=8546 npm run test:rpc
```

## Run tests directly (without the runner)

If you started a node yourself and want to run only the Mocha file:

```bash
# Terminal 1
npx hardhat node --hostname 127.0.0.1 --port 8545

# Terminal 2
$env:RPC_URL="http://127.0.0.1:8545"
npx hardhat test mocha test/rpc/RpcClient.test.ts
```

Without `RPC_URL`, the `RpcClient Hardhat integration` block fails with:

```
RPC_URL environment variable is required for Hardhat integration tests
```

## Test scenarios

### Malformed envelopes (one test, local HTTP stub)

- A string `error` in a JSON-RPC response produces a regular `Error` describing a malformed envelope, **not** a `RpcError`.

### URL validation (one test)

- `not-a-url` and `ftp://...` are rejected when creating `RpcClient`.

### Hardhat integration (four tests, requires a running node)

| Test | Method | Expectation |
|------|--------|-------------|
| Chain ID | `eth_chainId` | `"0x7a69"` |
| Block number | `eth_blockNumber` | Hex quantity `0x[0-9a-f]+` |
| Balance | `eth_accounts` + `eth_getBalance` | Positive balance |
| Unsupported method | `eth_nonexistentMethod_xyz` | `RpcError`, code `-32004`, with a message containing `not supported` |

### Contract calls (three tests, requires a running node)

The `RpcClient contract methods over JSON-RPC` block calls `Counter` methods without an ethers provider: calldata is encoded through `ethers.Interface`, bytecode is loaded from `artifacts/contracts/Counter.sol/Counter.json`, and calls are made through `RpcClient`.

| Test | RPC methods | Expectation |
|------|-------------|-------------|
| Deploy | `eth_sendTransaction` (bytecode) + `eth_getTransactionReceipt` | `status === "0x1"` and a `contractAddress` |
| Mint + transfer | `eth_sendTransaction` (`mint`, `transfer`) + `eth_call` (`balanceOf`) | Mint 1000 to the holder; transfer 400 from holder to recipient; balances `600` / `400` |
| Over-balance transfer | `eth_sendTransaction` (`transfer` beyond the balance) | Transaction is rejected and the holder balance remains unchanged |

Encoding and decoding use `counterInterface.encodeFunctionData(...)` and `decodeFunctionResult("balanceOf", raw)`. Receipts are awaited by the `waitForReceipt` helper, which polls `eth_getTransactionReceipt`.

## Test steps and Allure parameters

All tests in this module are divided into steps through the `step(...)` wrapper from `test/support/reporting.ts`, such as `Deploy Counter contract`, `Owner mints tokens to the holder`, and `eth_call confirms balances after transfer`. Steps are displayed inside each test in Allure Report.

Step **parameters** include the RPC method (`method=eth_sendTransaction` / `eth_call`), contract method (`call=mint` / `transfer` / `balanceOf`), addresses (`from`, `to`, `account`), amounts (`amount`), and results (`status`, `contractAddress`, `balanceOf(holder)`). They appear in the report and are printed in the terminal as `↳ <step> — key=value, …`, so every request and response is clear.

The `scripts/run-rpc-tests.mjs` runner starts child Mocha with `stdio: "inherit"`, so the test tree, steps, and `10 passing` summary appear in the parent terminal.

## Allure labels

| Block | epic | feature |
|-------|------|---------|
| Malformed | `JSON-RPC` | `Malformed envelopes` |
| Runner startup | `JSON-RPC` | `Runner startup` |
| URL / integration | `JSON-RPC` | `Hardhat node` |
| Contract calls | `JSON-RPC` | `Contract calls` |

## Extending the suite

1. Add methods to `RpcClient`, such as timeouts, headers, or new helpers.
2. Add `describe` / `it` cases to `RpcClient.test.ts`.
3. Integration tests must use `requireRpcUrl()`; do not hardcode a URL.
4. In CI, use `npm run test:rpc` rather than relying on an external `RPC_URL`.

## Troubleshooting failures

| Symptom | Cause | Resolution |
|---------|-------|------------|
| `Timed out ... waiting for Hardhat node` | The node did not start or the port is incorrect | Free the port or set `RPC_PORT` |
| `RPC_HOST must be a loopback address` | `RPC_HOST` contains an external host | Use only `127.0.0.1`, `localhost`, or `::1` |
| `RPC_PORT must be an integer between 1 and 65535` | Invalid port | Correct `RPC_PORT` |
| `RPC_URL environment variable is required` | Direct run without the environment variable | Set `RPC_URL` or use `npm run test:rpc` |
| `Hardhat node exited prematurely` | Node crash, busy port, or OOM | Check logs and change the port |
| EADDRINUSE | Port 8545 is busy | `$env:RPC_PORT="8546"; npm run test:rpc` |

The canonical URL with defaults is `http://127.0.0.1:8545`.
