import multer from "multer";
import { AppError } from "./errorHandler";

// Memory storage - files are small (a few hundred rows of departments at
// most) and we only ever read them once with the `xlsx` lib, so there's no
// need to touch disk the way the ticket-attachment flow does.
const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
  "application/octet-stream", // some browsers send this for .xlsx
]);

function isAllowedSpreadsheet(fileName: string, mimeType: string): boolean {
  const lower = fileName.toLowerCase();
  const hasAllowedExtension = lower.endsWith(".xlsx") || lower.endsWith(".xls");
  return hasAllowedExtension && ALLOWED_MIME_TYPES.has(mimeType);
}

export const MAX_SPREADSHEET_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

// Single-file spreadsheet upload, used for the departments bulk-upload
// endpoint. Field name on the multipart form must be "file".
export const uploadSpreadsheet = multer({
  storage,
  limits: { fileSize: MAX_SPREADSHEET_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedSpreadsheet(file.originalname, file.mimetype)) {
      cb(new AppError("Unsupported file type. Please upload an .xlsx or .xls file", 400));
      return;
    }
    cb(null, true);
  },
}).single("file");
