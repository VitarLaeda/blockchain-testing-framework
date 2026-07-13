import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import "dotenv/config";

const require = createRequire(import.meta.url);
const allure = require("allure-commandline");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const RESULTS_DIR = path.join(projectRoot, "reports", "allure-results");
const REPORT_DIR = path.join(projectRoot, "reports", "allure-report");
const REPORT_INDEX = path.join(REPORT_DIR, "index.html");
const REPORT_HISTORY_DIR = path.join(REPORT_DIR, "history");
const RESULTS_HISTORY_DIR = path.join(RESULTS_DIR, "history");
const HISTORY_TREND_FILE = path.join(REPORT_HISTORY_DIR, "history-trend.json");
const EXECUTOR_FILE = path.join(RESULTS_DIR, "executor.json");
const REPORT_NAME = "Blockchain Testing Framework";

function shouldOpenReport() {
  const raw = process.env.REPORT_OPEN;
  if (raw === undefined || raw === null) {
    return false;
  }

  return raw.trim().toLowerCase() === "true";
}

function printReportIndexMarker() {
  const absolutePath = path.resolve(REPORT_INDEX);
  console.log(`REPORT_INDEX=${absolutePath}`);
  return absolutePath;
}

function preserveHistory() {
  if (!fs.existsSync(REPORT_HISTORY_DIR)) {
    return;
  }

  try {
    fs.rmSync(RESULTS_HISTORY_DIR, { recursive: true, force: true });
    fs.cpSync(REPORT_HISTORY_DIR, RESULTS_HISTORY_DIR, { recursive: true });
  } catch (error) {
    console.warn(
      "Could not carry over Allure history from the previous report; trends may reset.",
    );
    console.warn(error instanceof Error ? error.message : String(error));
  }
}

function computeNextBuildOrder() {
  if (!fs.existsSync(HISTORY_TREND_FILE)) {
    return 1;
  }

  try {
    const trend = JSON.parse(fs.readFileSync(HISTORY_TREND_FILE, "utf8"));
    if (!Array.isArray(trend) || trend.length === 0) {
      return 1;
    }

    const maxBuildOrder = trend.reduce((max, entry) => {
      const order = Number(entry?.buildOrder);
      return Number.isFinite(order) && order > max ? order : max;
    }, 0);

    return maxBuildOrder + 1;
  } catch {
    return 1;
  }
}

function writeExecutorInfo() {
  const buildOrder = computeNextBuildOrder();
  const executor = {
    name: "Local",
    type: "local",
    buildOrder,
    buildName: `run #${buildOrder}`,
    reportName: REPORT_NAME,
  };

  try {
    fs.writeFileSync(EXECUTOR_FILE, `${JSON.stringify(executor, null, 2)}\n`);
  } catch (error) {
    console.warn("Could not write executor.json; trend labels may be missing.");
    console.warn(error instanceof Error ? error.message : String(error));
  }
}

function runAllure(args) {
  return new Promise((resolve, reject) => {
    const child = allure(args);

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Allure CLI exited with code ${code ?? "unknown"}`));
    });
  });
}

function printMissingResultsHelp() {
  console.error(`Allure results not found in: ${RESULTS_DIR}`);
  console.error(
    "No *-result.json files present. Run the test suites first to collect results:",
  );
  console.error("  npm test");
}

function printResultsFilesystemError(summary, error) {
  console.error(summary);
  console.error(`Path: ${RESULTS_DIR}`);
  if (error !== undefined) {
    console.error(error instanceof Error ? error.message : String(error));
  }
  console.error(
    "Ensure the Allure results path exists, is a readable directory, and is accessible to this process.",
  );
}

function printJavaInstallExamples() {
  console.error("    Install examples (run manually on your platform):");
  console.error("      Windows:");
  console.error(
    "        winget install --id EclipseAdoptium.Temurin.21.JDK -e",
  );
  console.error("      macOS:");
  console.error("        brew install --cask temurin");
  console.error("      Debian/Ubuntu:");
  console.error(
    "        sudo apt-get update && sudo apt-get install -y openjdk-21-jdk",
  );
  console.error(
    "    After installing Java, open a new terminal so PATH is refreshed, then rerun.",
  );
}

function printAllureFailureHelp(error) {
  console.error("Failed to generate Allure HTML report.");
  console.error(error instanceof Error ? error.message : String(error));
  console.error("");
  console.error("Prerequisites:");
  console.error(
    "  - Java Runtime Environment (JRE 8 or newer) must be installed and on PATH.",
  );
  console.error("    Verify with: java -version");
  printJavaInstallExamples();
  console.error(
    "  - Allure CLI is provided locally via the allure-commandline npm package.",
  );
  console.error(
    "    Verify with: node node_modules/allure-commandline/bin/allure --version",
  );
  console.error("");
  console.error("After fixing the environment, rerun:");
  console.error("  npm run report");
}

function printOpenFailureHelp(error) {
  console.error("Allure report was generated successfully.");
  printReportIndexMarker();
  console.error("");
  console.error("Failed to open the report with allure open.");
  console.error(error instanceof Error ? error.message : String(error));
  console.error("");
  console.error("You can still view the generated files after fixing the issue:");
  console.error("  REPORT_OPEN=true npm run report");
  console.error(
    "Or serve reports/allure-report/ through your CI artifact HTTP viewer.",
  );
  console.error("");
  console.error("Prerequisites for allure open:");
  console.error("    Verify with: java -version");
  printJavaInstallExamples();
}

function validateResultsDirectory() {
  if (!fs.existsSync(RESULTS_DIR)) {
    printMissingResultsHelp();
    process.exit(1);
  }

  let stat;
  try {
    stat = fs.statSync(RESULTS_DIR);
  } catch (error) {
    printResultsFilesystemError("Cannot access Allure results path.", error);
    process.exit(1);
  }

  if (!stat.isDirectory()) {
    printResultsFilesystemError(
      "Allure results path is not a directory.",
    );
    process.exit(1);
  }

  let entries;
  try {
    entries = fs.readdirSync(RESULTS_DIR, { withFileTypes: true });
  } catch (error) {
    printResultsFilesystemError("Cannot read Allure results directory.", error);
    process.exit(1);
  }

  const hasResults = entries
    .filter((entry) => entry.isFile())
    .some((entry) => entry.name.endsWith("-result.json"));

  if (!hasResults) {
    printMissingResultsHelp();
    process.exit(1);
  }
}

async function main() {
  validateResultsDirectory();

  preserveHistory();
  writeExecutorInfo();

  try {
    await runAllure([
      "generate",
      RESULTS_DIR,
      "-o",
      REPORT_DIR,
      "--clean",
    ]);
  } catch (error) {
    printAllureFailureHelp(error);
    process.exit(1);
  }

  if (!fs.existsSync(REPORT_INDEX)) {
    console.error(
      `Allure reported success but index.html is missing: ${REPORT_INDEX}`,
    );
    process.exit(1);
  }

  printReportIndexMarker();

  if (shouldOpenReport()) {
    try {
      await runAllure(["open", REPORT_DIR]);
    } catch (error) {
      printOpenFailureHelp(error);
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
