import app from "./app";
import { logger } from "./lib/logger";

// Default to a sensible port when the environment does not provide one
// (e.g. the v0 preview). On Replit the PORT env var is still injected and used.
const rawPort = process.env["PORT"] ?? "5000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
