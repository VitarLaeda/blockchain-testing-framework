# Contract tests (Counter)

This module tests `Counter.sol` on a local simulated Hardhat network (EDR, chain ID 31337). The tests do not require external RPC, Java, or MCP.

The contract combines a counter (`increment` / `reset` / `value`) with a minimal token: owner-only `mint` and `transfer(from, to, amount)`, which requires `msg.sender` to match `from`.

## Files

- Contract: `contracts/Counter.sol`
- Tests: `test/contracts/Counter.test.ts`
- Configuration: `hardhat.config.ts` (the `default` network and `spec` + `allure-mocha` reporters)

## Run

```bash
npm run compile
npm run test:contracts
```

Or as part of the full suite: `npm test`.

Additional commands:

```bash
npm run coverage   # coverage for Counter.test.ts only
npm run gas        # gas-stats → reports/gas-stats.json
```

## Test behavior (12 scenarios)

Counter (`describe("counter")`):

1. **Initial value** — `value() === 0` after deployment.
2. **Increment** — any account calls `increment()`, emits `CounterIncremented(1)`, and sets the value to `1`.
3. **Owner reset** — the owner resets the counter, emits `CounterReset(owner)`, and sets the value to `0`.
4. **Unauthorized reset** — a non-owner receives the `Unauthorized(caller)` custom error and the value does not change.
5. **Fixture isolation** — `networkHelpers.loadFixture` restores a snapshot, so a repeated call returns a fresh deployment with `value === 0`.

Token (`describe("token")`):

6. **Owner mint** — `mint(to, amount)` increases `balanceOf[to]` and `totalSupply`, and emits `Transfer(0x0, to, amount)`.
7. **Non-owner mint** — returns the `Unauthorized(caller)` custom error and leaves `totalSupply` unchanged.
8. **Mint to zero address** — returns the `InvalidAddress` custom error.
9. **Address-to-address transfer** — `transfer(from, to, amount)` moves a balance and emits `Transfer(from, to, amount)`.
10. **Over-balance transfer** — returns the `InsufficientBalance(from, available, required)` custom error.
11. **Transfer of another account's balance** — a call not made by `from` returns the `Unauthorized(caller)` custom error.
12. **Transfer to zero address** — returns the `InvalidAddress` custom error.

The `deployCounterFixture` fixture deploys `Counter` with the first signer as `owner` and returns `{ counter, owner, other, third }`.

## Test steps and Allure parameters

Each test is split into steps through the `step(...)` wrapper from `test/support/reporting.ts`, for fixture deployment, method calls, and state assertions. Allure Report displays them as a nested list with individual statuses and timings.

Steps have **parameters** for addresses (`to`, `from`, `caller`), amounts (`amount`, `available`), and calculated results (`balanceOf(holder)`, `totalSupply`, `value`). They appear when a step is expanded in the report and are printed in the terminal as `↳ <step> — key=value, …`, making every scenario's addresses, amounts, and resulting balance visible.

## Allure labels

| Level | Value |
|-------|-------|
| epic | `Solidity Contracts` |
| feature | `Counter` |
| story | Per scenario, for example `Owner mints tokens` |
| steps | Actions inside the test through `step(...)` |

## Extending the suite

1. Add methods to `Counter.sol`, then recompile with `npm run compile`.
2. Add an `it(...)` case to `Counter.test.ts` and use `loadFixture` for state isolation.
3. Set `epic`, `feature`, and `story` labels for Allure grouping.
4. Run `npm test` and `npm run report`.

## Troubleshooting failures

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| Solidity compilation failure | Syntax or compiler-version issue | Run `npm run compile` and check `solidity.version` in the configuration |
| `revertedWithCustomError` does not match | An error signature or ACL logic changed | Compare `Counter.sol` with the test expectation |
| 30-second timeout | A test or network is stuck | Increase `test.mocha.timeout` in the configuration, outside this documentation's scope |
| No Allure records | The tests were not run | `npm run test:contracts` creates `reports/allure-results/*-result.json` |

## Verifying success

The Mocha `spec` reporter prints the test tree, parameterized steps, and a `12 passing` summary. Verify success as follows:

1. **Terminal summary** — a line such as `12 passing` without `failing`.
2. **Exit code** — the command exits with code 0.
3. **Allure results** — `reports/allure-results/` contains new `*-result.json` files, one for each test with its own `steps` and `parameters`.
4. **Report (optional)** — `npm run report` exits with `REPORT_INDEX=...` and creates `reports/allure-report/index.html`.

A typical successful stdout fragment:

```
Running Mocha tests


  Counter
    counter
      ↳ Deploy Counter fixture
      ↳ Read initial value
      ✔ starts with value zero
    token
      ↳ Owner mints tokens to recipient — to=0x7099…79C8, amount=1000
      ↳ Recipient balance and total supply update
      ✔ mints tokens to an address and emits Transfer from zero


  12 passing (171ms)
```

If a test fails, Hardhat/Mocha prints a stack trace or error message and exits with a nonzero code.
