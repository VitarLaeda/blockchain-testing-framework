# Allure reporting

The project writes Mocha results to Allure and generates a static HTML report with the local CLI from the `allure-commandline` npm dependency.

## Lifecycle

```
npm test  →  reports/allure-results/*-result.json
                ↓
npm run report  →  reports/allure-report/index.html
```

| Directory                 | Contents                                                | Git     |
| ------------------------- | ------------------------------------------------------- | ------- |
| `reports/allure-results/` | JSON from `allure-mocha`: tests, containers, and labels | Ignored |
| `reports/allure-report/`  | Generated HTML, recreated with `--clean`                | Ignored |
| `reports/gas-stats.json`  | Output from `npm run gas`                               | Ignored |

The `scripts/generate-report.mjs` script **never** removes `allure-results`; it only clears the output `allure-report` through `allure generate --clean`.

## Test configuration

`hardhat.config.ts` uses `mocha-multi-reporters` to:

- print the complete test tree in the terminal with the `spec` reporter;
- write JSON for Allure with the `allure-mocha` reporter.

```ts
reporter: "mocha-multi-reporters",
reporterOptions: {
  reporterEnabled: "spec, allure-mocha",
  allureMochaReporterOptions: { resultsDir: "reports/allure-results" },
},
```

## Terminal logs

Thanks to the `spec` reporter, each run of `npm test`, `npm run test:contracts`, `test:rpc`, `test:mcp`, `coverage`, or `gas` prints:

- the `describe` → `it` tree with test names;
- the status (`✔` or an error) and duration of every test;
- a final line such as `12 passing`.

Each step also prints a line with parameters:

```
      ↳ Owner mints tokens to the holder — to=0x7099…79C8, amount=1000
      ↳ Balances reflect the transfer
```

This gives a complete view of a run directly in the terminal, without opening the HTML report.

## Labels (grouping by epic)

| epic                     | Module    | feature                                                              |
| ------------------------ | --------- | -------------------------------------------------------------------- |
| `Solidity Contracts`     | Contracts | `Counter`, `MiniToken`                                               |
| `JSON-RPC`               | RPC       | `RpcClient unit`, `Runner startup`, `Hardhat node`, `Contract calls` |
| `Model Context Protocol` | MCP       | `Blockchain MCP tools`                                               |

Allure Report displays modules as separate epics, with features and stories set by `allure-js-commons` in the tests.

## Test steps and their parameters

Tests in all modules use the `step(...)` wrapper from `test/support/reporting.ts`, built on `step` from `allure-js-commons`. Each test has a nested list of steps with individual statuses and timings in the `steps` field of the JSON result, and each step has a **parameters** table.

The helper supports two forms:

```ts
// Step without parameters
await step("Deploy Counter fixture", () => loadFixture(deployCounterFixture));

// Step with parameters (addresses, amounts, methods) that appear in the report and terminal
await step(
  "Owner mints tokens to the holder",
  { to: holder.address, amount: 1000n },
  async (ctx) => {
    await token.mint(holder.address, 1000n);
    // Calculated results can also be added to step parameters:
    await ctx.parameter("totalSupply", (await token.totalSupply()).toString());
  },
);
```

Parameters are both:

- stored in the Allure step and visible when it is expanded in the report;
- printed in the terminal as `↳ <step> — key=value, …`.

As a result, the complete scenario context—addresses, amounts, methods, and calculated results—is available in both the report and the console.

## Report command

```bash
npm run report
```

Prerequisite: `reports/allure-results/` contains at least one `*-result.json` file. Otherwise:

```
Allure results not found in: <path>/reports/allure-results
No *-result.json files present. Run the test suites first to collect results:
  npm test
```

The command exits with a nonzero status.

On success, stdout prints the stable marker:

```
REPORT_INDEX=<absolute path to reports/allure-report/index.html>
```

### Viewing the report

The generated Allure report is a **multi-file** HTML application. Opening `index.html` directly through `file://` is **not recommended**, because the browser blocks related resource loading.

**Local interactive use:** after generation, start `allure open` through `REPORT_OPEN`:

```bash
REPORT_OPEN=true npm run report
```

```powershell
$env:REPORT_OPEN="true"
npm run report
```

Or in `.env`:

```
REPORT_OPEN=true
```

The value is normalized with `trim` and `toLowerCase`, so `true`, `TRUE`, and `true` work; every other value only generates the report. Process environment variables take precedence over `.env` because `dotenv/config` is imported without `override`.

`allure open` starts a local HTTP server and opens the report. The process **blocks** until it is stopped with Ctrl+C.

**CI:** upload `reports/allure-report/` as a build artifact and open it through the pipeline HTTP viewer, such as GitHub Actions artifact browser or GitLab Pages preview. For automation, use generate-only mode: `npm run report` without `REPORT_OPEN`.

If generation succeeds but `allure open` fails, the script reports successful generation, prints `REPORT_INDEX=...`, and then provides open diagnostics.

## Java (required for reports)

Allure CLI is a Java application. **Node and the tests do not require Java; report generation does.**

Check Java:

```bash
java -version
```

In the project development environment, Java is version 22.0.1, though JRE 8+ is sufficient. If spawning Allure for generation or opening fails, the script prints Java/CLI diagnostics and does **not** report success. Filesystem preflight errors, such as a non-directory path or denied access, have separate messages without Java instructions.

Java installation examples, to run manually on your platform:

```powershell
# Windows
winget install --id EclipseAdoptium.Temurin.21.JDK -e
```

```bash
# macOS
brew install --cask temurin
```

```bash
# Debian/Ubuntu
sudo apt-get update && sudo apt-get install -y openjdk-21-jdk
```

After installation, open a **new** terminal so `PATH` is refreshed, then run `java -version` and retry `npm run report`.

A global Allure installation is not required. The project uses the package in `node_modules/allure-commandline`; on Windows it invokes `allure.bat` through the wrapper.

## CI-friendly sequence

```bash
npm ci
npm run compile
npm test
npm run report
```

Artifact check:

```bash
test -f reports/allure-report/index.html   # Unix
# Or:
if (Test-Path reports/allure-report/index.html) { "OK" }   # PowerShell
```

Upload `reports/allure-report/` as a build artifact and view it through the CI HTTP viewer. Locally, use `REPORT_OPEN=true npm run report`, which starts a blocking server.

Additional commands that do not directly affect Allure results but use the same contract suite:

```bash
npm run coverage
npm run gas
```

## Troubleshooting

| Problem                                                     | Resolution                                                                                                      |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| No `*-result.json`                                          | `npm test`                                                                                                      |
| `Cannot access` / `not a directory` / `Cannot read` results | Check permissions and confirm the path is a readable directory                                                  |
| `Allure CLI exited with code ...` during generation         | Install Java using the `winget`, `brew`, or `apt` examples above, open a new terminal, then run `java -version` |
| Generate OK, open failed                                    | The report already exists; see `REPORT_INDEX=...`, fix Java/CLI, or use the CI HTTP viewer                      |
| `index.html is missing` after generation                    | Run `npm test` again and check permissions for `reports/`                                                       |
| Empty report                                                | Confirm tests passed and results were not manually cleared between test and report                              |

Regenerating is safe: the old `allure-report` is replaced and `allure-results` is preserved.
