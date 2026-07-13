# Contract tests (Counter and MiniToken)

This module tests two Solidity contracts on a local simulated Hardhat network (EDR, chain ID 31337). The tests do not require external RPC, Java, or MCP.

- **`Counter`** — a focused counter: `increment()` (anyone), `reset()` (owner only), and the `value` getter. Emits `CounterIncremented` and `CounterReset`; reverts with the `Unauthorized` custom error.
- **`MiniToken`** — a compact ERC-20-style token with owner-restricted `mint`, standard `transfer(to, amount)`, and allowance-based `approve` / `transferFrom`. Emits `Transfer` and `Approval`; reverts with `Unauthorized`, `InvalidAddress`, `InsufficientBalance`, and `InsufficientAllowance`.

Both contracts carry full NatSpec documentation.

## Files

- Contracts: `contracts/Counter.sol`, `contracts/MiniToken.sol`
- Tests: `test/contracts/Counter.test.ts`, `test/contracts/MiniToken.test.ts`
- Configuration: `hardhat.config.ts` (the `default` network and `spec` + `allure-mocha` reporters)

## Run

```bash
npm run compile
npm run test:contracts
```

Or as part of the full suite: `npm test`.

Additional commands:

```bash
npm run coverage   # Solidity coverage for the contract suite
npm run gas        # gas-stats → reports/gas-stats.json
```

## Counter scenarios (5)

`describe("Counter")`:

1. **Initial value** — `value() === 0` after deployment.
2. **Increment** — any account calls `increment()`, emits `CounterIncremented(1)`, and sets the value to `1`.
3. **Owner reset** — the owner resets the counter, emits `CounterReset(owner)`, and sets the value to `0`.
4. **Unauthorized reset** — a non-owner receives the `Unauthorized(caller)` custom error and the value does not change.
5. **Fixture isolation** — `networkHelpers.loadFixture` restores a snapshot, so a repeated call returns a fresh deployment with `value === 0`.

The `deployCounterFixture` fixture deploys `Counter` with the first signer as `owner` and returns `{ counter, owner, other, third }`.

## MiniToken scenarios (10)

`describe("MiniToken")`:

**metadata**

1. **Metadata** — `name`, `symbol`, and `decimals` (18) match the constructor arguments.

**mint**

2. **Owner mint** — `mint(to, amount)` increases `balanceOf[to]` and `totalSupply`, and emits `Transfer(0x0, to, amount)`.
3. **Non-owner mint** — returns the `Unauthorized(caller)` custom error and leaves `totalSupply` unchanged.
4. **Mint to zero address** — returns the `InvalidAddress` custom error.

**transfer**

5. **Transfer** — `transfer(to, amount)` moves the caller's balance and emits `Transfer(caller, to, amount)`.
6. **Over-balance transfer** — returns the `InsufficientBalance(account, available, required)` custom error.
7. **Transfer to zero address** — returns the `InvalidAddress` custom error.

**approve and transferFrom**

8. **Approve** — `approve(spender, amount)` records the allowance and emits `Approval(owner, spender, amount)`.
9. **transferFrom** — a spender moves the holder's tokens within the allowance; balances update and the allowance is decremented.
10. **Over-allowance transferFrom** — returns the `InsufficientAllowance(spender, available, required)` custom error.

The `deployTokenFixture` fixture deploys `MiniToken("Mini Token", "MINI", owner)` and returns `{ token, owner, holder, recipient, spender }`.

## Test steps and Allure parameters

Each test is split into steps through the `step(...)` wrapper from `test/support/reporting.ts`, for fixture deployment, method calls, and state assertions. Allure Report displays them as a nested list with individual statuses and timings.

Steps have **parameters** for addresses (`to`, `from`, `caller`, `spender`), amounts (`amount`, `available`, `allowance`), and calculated results (`balanceOf(holder)`, `totalSupply`, `value`). They appear when a step is expanded in the report and are printed in the terminal as `↳ <step> — key=value, …`.

## Allure labels

| Level   | Value                                          |
| ------- | ---------------------------------------------- |
| epic    | `Solidity Contracts`                           |
| feature | `Counter` / `MiniToken`                        |
| story   | Per scenario, for example `Owner mints tokens` |
| steps   | Actions inside the test through `step(...)`    |

## Extending the suite

1. Add methods to a contract, then recompile with `npm run compile`.
2. Add an `it(...)` case to the relevant `*.test.ts` and use `loadFixture` for state isolation.
3. Set `epic`, `feature`, and `story` labels for Allure grouping.
4. Run `npm test` and `npm run report`.

## Troubleshooting failures

| Symptom                                  | Likely cause                            | Action                                                                  |
| ---------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| Solidity compilation failure             | Syntax or compiler-version issue        | Run `npm run compile` and check `solidity.version` in the configuration |
| `revertedWithCustomError` does not match | An error signature or ACL logic changed | Compare the contract with the test expectation                          |
| 30-second timeout                        | A test or network is stuck              | Increase `test.mocha.timeout` in the configuration                      |
| No Allure records                        | The tests were not run                  | `npm run test:contracts` creates `reports/allure-results/*-result.json` |

## Verifying success

The Mocha `spec` reporter prints the test tree, parameterized steps, and a `15 passing` summary for this module. Verify success as follows:

1. **Terminal summary** — a line such as `15 passing` without `failing`.
2. **Exit code** — the command exits with code 0.
3. **Allure results** — `reports/allure-results/` contains new `*-result.json` files.
4. **Report (optional)** — `npm run report` exits with `REPORT_INDEX=...` and creates `reports/allure-report/index.html`.
