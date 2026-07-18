import { Response } from "express";
import { AuthedRequest } from "../middleware/auth";
import { prisma } from "../lib/database";

export const subDepartmentController = {
  // POST /departments/:departmentId/subdepartments  { name, description? }  (GLOBAL_ADMIN, HOD)
  async create(req: AuthedRequest, res: Response) {
    const subDepartment = await prisma.subDepartment.create({
      data: {
        departmentId: req.params.departmentId,
        name: req.body.name,
        description: req.body.description,
      },
    });
    res.status(201).json(subDepartment);
  },

  // GET /departments/:departmentId/subdepartments
  async list(req: AuthedRequest, res: Response) {
    const subDepartments = await prisma.subDepartment.findMany({
      where: { departmentId: req.params.departmentId },
      orderBy: { name: "asc" },
    });
    res.json(subDepartments);
  },

  // PATCH /subdepartments/:id  { name?, description? }  (GLOBAL_ADMIN, HOD)
  async update(req: AuthedRequest, res: Response) {
    const subDepartment = await prisma.subDepartment.update({
      where: { id: req.params.id },
      data: {
        name: req.body.name,
        description: req.body.description,
      },
    });
    res.json(subDepartment);
  },

  // DELETE /subdepartments/:id  (GLOBAL_ADMIN)
  // Categories mapped to this sub-department are NOT deleted - the FK is
  // ON DELETE SET NULL, so they just fall back to being department-wide.
  async delete(req: AuthedRequest, res: Response) {
    await prisma.subDepartment.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: "sub-department deleted" });
  },
};
