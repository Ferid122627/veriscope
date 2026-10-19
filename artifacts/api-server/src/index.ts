import app from "./app";
import { logger } from "./lib/logger";
import { failInterruptedAnalyses } from "./lib/analysis-runner";
import { failInterruptedReassessments } from "./lib/reassessment-runner";
import { seedTemplateUsers } from "./lib/auth";
import { migrateLegacyValues } from "./lib/legacy-values";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

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
  migrateLegacyValues(logger).catch((e) =>
    logger.error({ err: e }, "Could not convert legacy status values"),
  );
  seedTemplateUsers().catch((e) =>
    logger.error({ err: e }, "Could not create template users"),
  );
  failInterruptedAnalyses(logger).catch((e) =>
    logger.error({ err: e }, "Could not reset interrupted analyses"),
  );
  failInterruptedReassessments(logger).catch((e) =>
    logger.error({ err: e }, "Could not reset interrupted reassessments"),
  );
});
