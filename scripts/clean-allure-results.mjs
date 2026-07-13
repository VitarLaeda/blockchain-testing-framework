import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const RESULTS_DIR = path.join(projectRoot, "reports", "allure-results");

function cleanResultsDir() {
  fs.rmSync(RESULTS_DIR, { recursive: true, force: true });
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

try {
  cleanResultsDir();
  console.log(`Cleared Allure results: ${RESULTS_DIR}`);
} catch (error) {
  console.error(`Failed to clear Allure results: ${RESULTS_DIR}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
