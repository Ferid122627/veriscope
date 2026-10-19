import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// Documents are sent as extracted text; allow large contracts/reports.
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Last-resort handler: log the real error, return a JSON error the client can show.
const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const status =
    typeof err?.status === "number" && err.status >= 400 && err.status < 600 ? err.status : 500;
  req.log.error({ err }, "Unhandled request error");
  if (res.headersSent) return;
  res.status(status).json({
    error: status === 413 ? "Document is too large (limit 5 MB of text)" : status < 500 ? (err.message ?? "Bad request") : "Internal server error",
  });
};
app.use(errorHandler);

export default app;
