import type { RequestHandler } from "express";
import multer from "multer";
import { MAX_UPLOAD_BYTES } from "./text-extraction";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 10, fieldSize: 2 * 1024 * 1024 },
});

/** Accept an optional single file in the "file" field; translate multer errors to {error}. */
export const receiveFile: RequestHandler = (req, res, next) => {
  upload.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const tooLarge = err.code === "LIMIT_FILE_SIZE" || err.code === "LIMIT_FIELD_VALUE";
      res.status(tooLarge ? 413 : 400).json({
        error: tooLarge
          ? `The upload is larger than the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit.`
          : `Upload rejected: ${err.message}. Send one file in the "file" field.`,
      });
      return;
    }
    next(err);
  });
};

/** Browsers send UTF-8 filenames; multer decodes them as latin1. */
export function uploadedFilename(file: Express.Multer.File): string {
  return Buffer.from(file.originalname, "latin1").toString("utf8");
}
