import { Router } from "express";
import { UserRole } from "../generated/prisma/client";
import { requireAuth, requireRole } from "../middleware/auth";
import { departmentController } from "../controllers/department.controller";
import { ticketCategoryController } from "../controllers/ticketCategory.controller";
import { subDepartmentController } from "../controllers/subDepartment.controller";
import { asyncHandler } from "../middleware/asyncHandler";
import { uploadSpreadsheet } from "../middleware/upload";

export const departmentRouter = Router();

departmentRouter.post("/", requireAuth, requireRole(UserRole.GLOBAL_ADMIN), departmentController.create);
departmentRouter.get("/", requireAuth, departmentController.list);

// Bulk upload (GLOBAL_ADMIN only) - registered ahead of "/:id" so
// "bulk-upload" isn't swallowed by the :id param route.
departmentRouter.get(
  "/bulk-upload/template",
  requireAuth,
  requireRole(UserRole.GLOBAL_ADMIN),
  asyncHandler(departmentController.downloadTemplate)
);
departmentRouter.post(
  "/bulk-upload",
  requireAuth,
  requireRole(UserRole.GLOBAL_ADMIN),
  uploadSpreadsheet,
  asyncHandler(departmentController.bulkUpload)
);

departmentRouter.get("/:id", requireAuth, departmentController.getById);
departmentRouter.patch("/:id", requireAuth, requireRole(UserRole.GLOBAL_ADMIN, UserRole.HOD), departmentController.update);

// Categories are configured per-department - this is where the SLA hours /
// default priority / min support level used by ticketService get set.
departmentRouter.post(
  "/:departmentId/categories",
  requireAuth,
  requireRole(UserRole.GLOBAL_ADMIN, UserRole.HOD),
  ticketCategoryController.create
);

departmentRouter.get("/:departmentId/categories", requireAuth, ticketCategoryController.list);

// Sub-departments are an optional grouping within a department. Categories
// can optionally be scoped to one of these (see ticketCategory.controller).
departmentRouter.post(
  "/:departmentId/subdepartments",
  requireAuth,
  requireRole(UserRole.GLOBAL_ADMIN, UserRole.HOD),
  subDepartmentController.create
);
departmentRouter.get("/:departmentId/subdepartments", requireAuth, subDepartmentController.list);

departmentRouter.delete("/:id",requireAuth,departmentController.delete)

