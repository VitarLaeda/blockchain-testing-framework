import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createBlockchainMcpServer } from "./BlockchainMcpServer.js";

export interface McpTestSession {
  client: Client;
  cleanup: () => Promise<void>;
}

export async function createMcpTestSession(): Promise<McpTestSession> {
  const server = createBlockchainMcpServer();
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "blockchain-mcp-test-client", version: "1.0.0" },
    { capabilities: {} },
  );

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  let cleanupPromise: Promise<void> | undefined;

  const cleanup = async (): Promise<void> => {
    if (!cleanupPromise) {
      cleanupPromise = (async () => {
        try {
          await client.close();
        } finally {
          await server.close();
        }
      })();
    }

    return cleanupPromise;
  };

  return {
    client,
    cleanup,
  };
}
