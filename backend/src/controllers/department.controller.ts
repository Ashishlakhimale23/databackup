import { Response } from "express";
import { AuthedRequest } from "../middleware/auth";
import { prisma } from "../lib/database";
import { AppError } from "../middleware/errorHandler";
import {
  buildDepartmentTemplateWorkbook,
  parseDepartmentWorkbook,
  DepartmentRowError,
} from "../utils/departmentBulkUpload";

export const departmentController = {
  // POST /departments  { name, description }  (GLOBAL_ADMIN only)
  async create(req: AuthedRequest, res: Response) {
    const department = await prisma.department.create({
      data: {
        name: req.body.name,
        description: req.body.description,
      },
    });
    res.status(201).json(department);
  },

  // GET /departments
  async list(req: AuthedRequest, res: Response) {
    const departments = await prisma.department.findMany({
      select: {
        _count: { select: { agents: true, tickets: true, } },
        id : true,
        name : true,  
        description : true, 
        cxo: {
          select: {
            fullName: true
          },
        },
        manager:{
          select :{ 
            fullName :true
          }
        }
      },
    });
    res.json(departments);
  },

  // GET /departments/:id
  // @ts-ignore
  async getById(req: AuthedRequest, res: Response) {
    const department = await prisma.department.findUnique({
      where: { id: req.params.id },
      include: { agents: true, categories: true, keywords: true },
    });
    if (!department) return res.status(404).json({ error: "Not found" });
    res.json(department);
  },

  // PATCH /departments/:id  { name?, description? }  (GLOBAL_ADMIN only)
  async update(req: AuthedRequest, res: Response) {
    const department = await prisma.department.update({
      where: { id: req.params.id },
      data: { name: req.body.name, description: req.body.description },
    });
    res.json(department);
  },

  async delete(req:AuthedRequest,res:Response){
    const deleteDepartment = await prisma.department.delete({
      where : {id : req.params.id},
    })
    res.status(200).json({message:"department deleted"})
  },

  // GET /departments/bulk-upload/template  (GLOBAL_ADMIN only)
  // Returns a .xlsx template with the columns accepted by bulkUpload below
  // (currently the same fields as `create`: name, description).
  async downloadTemplate(req: AuthedRequest, res: Response) {
    const buffer = buildDepartmentTemplateWorkbook();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", 'attachment; filename="department_bulk_upload_template.xlsx"');
    res.send(buffer);
  },

  // POST /departments/bulk-upload  (multipart/form-data, field "file")  (GLOBAL_ADMIN only)
  // Reads the uploaded .xlsx/.xls, creates one Department per valid row,
  // and returns a per-row summary so the admin can see exactly what
  // happened without guessing from a single success/failure flag.
  async bulkUpload(req: AuthedRequest, res: Response) {
    const file = (req as AuthedRequest & { file?: Express.Multer.File }).file;
    if (!file) {
      throw new AppError("No file uploaded. Attach an .xlsx or .xls file under the 'file' field", 400);
    }

    const { rows, errors: parseErrors } = parseDepartmentWorkbook(file.buffer);

    const existing = await prisma.department.findMany({ select: { name: true } });
    const existingNames = new Set(existing.map((d) => d.name.trim().toLowerCase()));

    const rowErrors: DepartmentRowError[] = [...parseErrors];
    const skipped: { row: number; name: string; reason: string }[] = [];
    const toCreate = rows.filter((row) => {
      if (existingNames.has(row.name.toLowerCase())) {
        skipped.push({ row: row.row, name: row.name, reason: "A department with this name already exists" });
        return false;
      }
      return true;
    });

    const created = toCreate.length
      ? await prisma.$transaction(
          toCreate.map((row) =>
            prisma.department.create({
              data: { name: row.name, description: row.description },
            })
          )
        )
      : [];

    res.status(201).json({
      totalRows: rows.length + parseErrors.length,
      createdCount: created.length,
      skippedCount: skipped.length,
      errorCount: rowErrors.length,
      departments: created,
      skipped,
      errors: rowErrors.sort((a, b) => a.row - b.row),
    });
  },
};

