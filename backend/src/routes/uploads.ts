import { Router } from "express";
import express from "express";
import fs from "fs";
import { resolveLocalAttachmentPath, MAX_ATTACHMENT_SIZE_BYTES } from "../lib/s3";

// ---------------------------------------------------------------------------
// Temporary local-storage stand-in for direct-to-S3 uploads. The frontend
// still PUTs the raw file bytes to the `uploadUrl` it gets back from
// `POST /tickets/:ticketId/attachments/presign` (see lib/s3.ts) - the only
// difference is that URL now points here instead of at an S3 presigned URL,
// and the bytes land on disk under `backend/attachment/<key>` instead of in
// a bucket.
// ---------------------------------------------------------------------------

export const uploadsRouter = Router();

uploadsRouter.put(
  "/*",
  express.raw({ type: "*/*", limit: MAX_ATTACHMENT_SIZE_BYTES }),
  (req, res): void => {
    const key = (req.params as any)[0] as string;
    if (!key) {
      res.status(400).json({ error: "Missing attachment key" });
      return;
    }

    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: "No file data received" });
      return;
    }
    if (body.length > MAX_ATTACHMENT_SIZE_BYTES) {
      res.status(400).json({ error: "File exceeds the 20MB limit" });
      return;
    }

    const filePath = resolveLocalAttachmentPath(key);
    fs.writeFile(filePath, body, (err) => {
      if (err) {
        res.status(500).json({ error: "Failed to save file to local storage" });
        return;
      }
      res.status(200).json({ ok: true });
    });
  }
);

uploadsRouter.get("/*", (req, res): void => {
  const key = (req.params as any)[0] as string;
  if (!key) {
    res.status(400).json({ error: "Missing attachment key" });
    return;
  }
  const filePath = resolveLocalAttachmentPath(key);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).json({ error: "File not found" });
    }
  });
});
