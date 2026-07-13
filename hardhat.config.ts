import "dotenv/config";

import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  solidity: {
    version: "0.8.28",
  },
  paths: {
    tests: {
      mocha: "./test",
    },
  },
  networks: {
    default: {
      type: "edr-simulated",
      chainType: "l1",
      chainId: 31337,
    },
    node: {
      type: "edr-simulated",
      chainType: "l1",
      chainId: 31337,
    },
  },
  test: {
    mocha: {
      timeout: 30_000,
      reporter: "mocha-multi-reporters",
      reporterOptions: {
        reporterEnabled: "spec, allure-mocha",
        allureMochaReporterOptions: {
          resultsDir: "reports/allure-results",
        },
      },
    },
  },
  coverage: {
    skipFiles: [],
  },
});
