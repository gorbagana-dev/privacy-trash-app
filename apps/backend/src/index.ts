import { serve } from "@hono/node-server";

import { createApp } from "@/api/app";
import { createDependencies } from "@/dependencies";

const deps = createDependencies();
const app = createApp(deps);

const server = serve(
  {
    fetch: app.fetch,
    hostname: deps.env.HOST,
    port: deps.env.PORT,
  },
  (info) => {
    deps.logger.info(
      {
        host: info.address,
        port: info.port,
      },
      "Privacy Trash backend started",
    );
  },
);

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  deps.logger.info({ signal }, "Shutting down Privacy Trash backend");

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
  await deps.close();
}

process.once("SIGINT", (signal) => {
  void shutdown(signal).then(() => process.exit(0));
});

process.once("SIGTERM", (signal) => {
  void shutdown(signal).then(() => process.exit(0));
});
