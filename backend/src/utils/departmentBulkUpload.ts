import * as XLSX from "xlsx";
import { AppError } from "../middleware/errorHandler";

// Bulk-upload / template support for POST /departments.
// Kept in sync with departmentController.create's accepted body shape
// ({ name, description }) - if more fields are ever added to department
// creation, add a column here and to the row parser below.

export const DEPARTMENT_TEMPLATE_HEADERS = ["name", "description"] as const;

export interface ParsedDepartmentRow {
  row: number; // 1-based spreadsheet row number (including header), for error messages
  name: string;
  description?: string;
}

export interface DepartmentRowError {
  row: number;
  reason: string;
}

/**
 * Builds the .xlsx template workbook admins download and fill in. Includes
 * a header row, one example row, and a short instructions sheet so it's
 * self-explanatory without needing separate documentation.
 */
export function buildDepartmentTemplateWorkbook(): Buffer {
  const workbook = XLSX.utils.book_new();

  const dataSheet = XLSX.utils.aoa_to_sheet([
    [...DEPARTMENT_TEMPLATE_HEADERS],
    ["IT Support", "Handles internal IT tickets and hardware requests"],
  ]);
  dataSheet["!cols"] = [{ wch: 30 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(workbook, dataSheet, "Departments");

  const instructionsSheet = XLSX.utils.aoa_to_sheet([
    ["Instructions"],
    ["1. Keep the header row (name, description) as the first row of the Departments sheet."],
    ["2. 'name' is required and must be unique - rows with a blank name or a name that duplicates"],
    ["   another row, or an existing department, will be skipped."],
    ["3. 'description' is optional."],
    ["4. Remove the example row before uploading, or leave it - 'IT Support' will simply be skipped"],
    ["   if a department with that name already exists."],
    ["5. Save the file as .xlsx or .xls and upload it from the Departments page."],
  ]);
  instructionsSheet["!cols"] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instructions");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/**
 * Parses an uploaded workbook's first sheet into department rows. Throws
 * an AppError for structural problems (unreadable file, missing header,
 * no data rows) - per-row problems (blank name, in-file duplicates) are
 * returned as `errors` for the caller to report back to the admin rather
 * than failing the whole upload.
 */
export function parseDepartmentWorkbook(buffer: Buffer): {
  rows: ParsedDepartmentRow[];
  errors: DepartmentRowError[];
} {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch {
    throw new AppError("Could not read the uploaded file. Please upload a valid .xlsx or .xls file", 400);
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) {
    throw new AppError("The uploaded file has no sheets", 400);
  }

  // header: 1 => array-of-arrays, so we control our own header matching
  // instead of relying on the sheet's exact casing/whitespace.
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
  if (raw.length === 0) {
    throw new AppError("The uploaded file is empty", 400);
  }

  const headerRow = raw[0].map((h) => String(h ?? "").trim().toLowerCase());
  const nameCol = headerRow.indexOf("name");
  const descriptionCol = headerRow.indexOf("description");

  if (nameCol === -1) {
    throw new AppError(
      `Missing required "name" column. Expected headers: ${DEPARTMENT_TEMPLATE_HEADERS.join(", ")}`,
      400
    );
  }

  const dataRows = raw.slice(1);
  if (dataRows.length === 0) {
    throw new AppError("The uploaded file has no data rows", 400);
  }

  const rows: ParsedDepartmentRow[] = [];
  const errors: DepartmentRowError[] = [];
  const seenNames = new Set<string>();

  dataRows.forEach((cells, idx) => {
    const spreadsheetRow = idx + 2; // +1 for 0-index, +1 for the header row
    const name = String(cells[nameCol] ?? "").trim();
    const description = descriptionCol !== -1 ? String(cells[descriptionCol] ?? "").trim() : "";

    if (!name) {
      errors.push({ row: spreadsheetRow, reason: "Missing department name" });
      return;
    }
    if (name.length > 200) {
      errors.push({ row: spreadsheetRow, reason: "Department name exceeds 200 characters" });
      return;
    }

    const dedupeKey = name.toLowerCase();
    if (seenNames.has(dedupeKey)) {
      errors.push({ row: spreadsheetRow, reason: `Duplicate name "${name}" within the file` });
      return;
    }
    seenNames.add(dedupeKey);

    rows.push({ row: spreadsheetRow, name, description: description || undefined });
  });

  return { rows, errors };
}
