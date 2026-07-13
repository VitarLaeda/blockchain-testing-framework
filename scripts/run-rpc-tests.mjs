import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const STARTUP_TIMEOUT_MS = Number(
  process.env.RPC_STARTUP_TIMEOUT_MS ?? "30000",
);
const POLL_INTERVAL_MS = 250;
const OUTPUT_BUFFER_MAX_BYTES = 16 * 1024;
const TEST_FILE = "test/rpc/RpcClient.test.ts";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function resolveHardhatBin() {
  return path.join(
    projectRoot,
    "node_modules",
    "hardhat",
    "dist",
    "src",
    "cli.js",
  );
}

export function parseRpcHost(rawHost) {
  const host = (rawHost ?? "127.0.0.1").trim();

  if (!host) {
    throw new Error("RPC_HOST must be a non-empty string");
  }

  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `RPC_HOST must be a loopback address (127.0.0.1, localhost, or ::1), got: ${rawHost}`,
    );
  }

  return host;
}

export function parseRpcPort(rawPort) {
  const portText = rawPort ?? "8545";
  const port = Number(portText);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `RPC_PORT must be an integer between 1 and 65535, got: ${rawPort ?? portText}`,
    );
  }

  return port;
}

export function buildCanonicalRpcUrl(host, port) {
  const bracketedHost = host.includes(":") ? `[${host}]` : host;
  return `http://${bracketedHost}:${port}`;
}

export function resolveRunnerEndpoint() {
  const host = parseRpcHost(process.env.RPC_HOST);
  const port = parseRpcPort(process.env.RPC_PORT);
  const rpcUrl = buildCanonicalRpcUrl(host, port);

  return { host, port, rpcUrl };
}

export function attachBoundedOutputCapture(
  child,
  maxBytes = OUTPUT_BUFFER_MAX_BYTES,
) {
  const chunks = [];
  let totalBytes = 0;

  const append = (chunk) => {
    const text = chunk.toString();
    chunks.push(text);
    totalBytes += Buffer.byteLength(text, "utf8");

    while (totalBytes > maxBytes && chunks.length > 0) {
      const removed = chunks.shift();
      totalBytes -= Buffer.byteLength(removed, "utf8");
    }
  };

  child.stdout?.on("data", append);
  child.stderr?.on("data", append);

  return {
    getText() {
      return chunks.join("");
    },
  };
}

export function buildNodeStartupError({
  exitCode = null,
  signal = null,
  output = "",
  host,
  port,
}) {
  const trimmedOutput = output.trim();
  const excerpt = trimmedOutput
    ? `\n\nHardhat node output:\n${trimmedOutput.slice(-2000)}`
    : "";

  if (/EADDRINUSE|address already in use/i.test(output)) {
    return new Error(
      `Hardhat node failed to bind ${host}:${port}: port is already in use (EADDRINUSE). ` +
        `Choose a different RPC_PORT or stop the process using the port.${excerpt}`,
    );
  }

  if (signal) {
    return new Error(
      `Hardhat node terminated by signal ${signal} during startup.${excerpt}`,
    );
  }

  return new Error(
    `Hardhat node exited during startup with code ${exitCode ?? "unknown"}.${excerpt}`,
  );
}

async function pollChainId(url) {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_chainId",
    params: [],
  });

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!response.ok) {
    throw new Error(`eth_chainId probe failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload?.result !== "0x7a69") {
    throw new Error(
      `eth_chainId probe returned unexpected result: ${String(payload?.result)}`,
    );
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForNode(
  url,
  { nodeProcess, outputCapture, host, port },
) {
  let nodeReady = false;
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;

  const failOnEarlyExit = new Promise((_, reject) => {
    const onExit = (code, signal) => {
      if (nodeReady) {
        return;
      }

      nodeProcess.off("exit", onExit);
      reject(
        buildNodeStartupError({
          exitCode: code,
          signal,
          output: outputCapture.getText(),
          host,
          port,
        }),
      );
    };

    nodeProcess.on("exit", onExit);
  });

  try {
    while (Date.now() < deadline) {
      const pollAttempt = pollChainId(url)
        .then(() => "ready")
        .catch(() => "retry");

      const outcome = await Promise.race([
        pollAttempt,
        failOnEarlyExit,
        sleep(POLL_INTERVAL_MS).then(() => "retry"),
      ]);

      if (outcome === "ready") {
        nodeReady = true;
        return;
      }
    }

    if (nodeProcess.exitCode !== null) {
      throw buildNodeStartupError({
        exitCode: nodeProcess.exitCode,
        signal: nodeProcess.signalCode,
        output: outputCapture.getText(),
        host,
        port,
      });
    }

    throw new Error(
      `Timed out after ${STARTUP_TIMEOUT_MS}ms waiting for Hardhat node at ${url}`,
    );
  } finally {
    nodeReady = true;
  }
}

function spawnNodeProcess(host, port) {
  const hardhatBin = resolveHardhatBin();

  const child = spawn(
    process.execPath,
    [hardhatBin, "node", "--hostname", host, "--port", String(port)],
    {
      cwd: projectRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );

  child.once("error", (error) => {
    console.error(`Failed to start Hardhat node: ${error.message}`);
    process.exit(1);
  });

  return child;
}

function spawnTestProcess(rpcUrl) {
  const hardhatBin = resolveHardhatBin();

  const child = spawn(
    process.execPath,
    [hardhatBin, "test", "mocha", TEST_FILE],
    {
      cwd: projectRoot,
      env: { ...process.env, RPC_URL: rpcUrl },
      stdio: "inherit",
      windowsHide: true,
    },
  );

  child.once("error", (error) => {
    console.error(`Failed to start Hardhat test process: ${error.message}`);
    process.exit(1);
  });

  return child;
}

function terminateProcess(child, signal = "SIGTERM") {
  if (!child || child.exitCode !== null || child.killed) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const forceKillTimer = setTimeout(() => {
      if (child.exitCode === null && !child.killed) {
        child.kill("SIGKILL");
      }
    }, 5000);

    child.once("exit", () => {
      clearTimeout(forceKillTimer);
      resolve();
    });

    child.kill(signal);
  });
}

async function terminateAll(nodeProcess, testProcess, signal = "SIGTERM") {
  await Promise.all([
    terminateProcess(testProcess, signal),
    terminateProcess(nodeProcess, signal),
  ]);
}

async function main() {
  const { host, port, rpcUrl } = resolveRunnerEndpoint();
  let nodeProcess;
  let testProcess;
  let testExitCode = 1;
  let cleanupError;
  let shuttingDown = false;

  const handleSignal = (signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    void terminateAll(nodeProcess, testProcess, signal).finally(() => {
      process.exit(128 + (signal === "SIGINT" ? 2 : 15));
    });
  };

  process.once("SIGINT", () => handleSignal("SIGINT"));
  process.once("SIGTERM", () => handleSignal("SIGTERM"));

  try {
    nodeProcess = spawnNodeProcess(host, port);
    const outputCapture = attachBoundedOutputCapture(nodeProcess);

    await waitForNode(rpcUrl, {
      nodeProcess,
      outputCapture,
      host,
      port,
    });

    nodeProcess.once("exit", (code, signal) => {
      if (shuttingDown) {
        return;
      }

      if (signal) {
        cleanupError ??= new Error(
          `Hardhat node terminated by signal ${signal}`,
        );
        return;
      }

      if (code !== 0 && code !== null) {
        cleanupError ??= buildNodeStartupError({
          exitCode: code,
          signal,
          output: outputCapture.getText(),
          host,
          port,
        });
      }
    });

    testExitCode = await new Promise((resolve, reject) => {
      testProcess = spawnTestProcess(rpcUrl);

      testProcess.once("exit", (code, signal) => {
        if (signal) {
          reject(new Error(`Test process terminated by signal ${signal}`));
          return;
        }
        resolve(code ?? 1);
      });
    });
  } catch (error) {
    cleanupError ??= error;
  } finally {
    shuttingDown = true;
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    await terminateAll(nodeProcess, testProcess);
  }

  if (cleanupError) {
    console.error(cleanupError);
    process.exit(1);
  }

  process.exit(testExitCode);
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
