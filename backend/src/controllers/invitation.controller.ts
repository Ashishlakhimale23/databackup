import { Response } from "express";
import { AuthedRequest } from "../middleware/auth";
import { invitationService, InvitationError } from "../services/invitation.service";
import { prisma } from "../lib/database";

// No try/catch needed here - routes wrap these in asyncHandler, and
// InvitationError is caught centrally by middleware/errorHandler.ts.
export const invitationController = {
  // POST /invitations  (GLOBAL_ADMIN, DEPT_ADMIN)
  // @ts-ignore
  async create(req: AuthedRequest, res: Response) {
    try {
      const inviter = req.user
      if (inviter == undefined || !inviter || inviter == null) {
        return res.status(401).json({ message: "no inviter found" })
      }

      // take stae if agenta
      const invitation = await invitationService.createInvitation({
        inviter: {
          id: inviter.id,
          role: inviter.role,
        },
        email: req.body.email,
        role: req.body.role,
        name: req.body.name,
        state : req.body.state,
        windCategory: req.body.role === "AGENT" ? (req.body.windCategory || null) : null,
        departmentId: req.body.departmentId,
        departmentIds : req.body.departmentIds,
        categoryIds: req.body.categoryIds,
        supportLevel: req.body.supportLevel,
      });
      res.status(201).json({
        message:
          "Successfully send invite"
      });

    } catch (error) {
      console.log(error)
      //@ts-ignore
      return res.status(401).json(error.message)

    }

  },

  // POST /invitations/bulk  (GLOBAL_ADMIN, DEPT_ADMIN)
  // Bulk version of `create` above - role/category/state/windCategory
  // settings are applied to every row (exactly what the "Onboard Staff
  // Member" form already collects once), except:
  //  - HOD/CXO: each row may carry its own `departmentIds` (an HOD row and
  //    a CXO row in the same batch can each report to different
  //    departments).
  //  - AGENT: each row may carry its own `departmentId`, `categoryIds`,
  //    `state`, and `windCategory` (each agent can be onboarded to a
  //    different department/category/state/wind coverage in one batch).
  // Any row that omits its per-row fields falls back to the shared
  // field(s) from the request body, for backward compatibility with any
  // caller still sending one set of values for the whole batch.
  //
  // Reuses invitationService.createInvitation per row, so validation,
  // password pre-set, and the invite email are identical to a single
  // invite. Does not touch `create`/`accept` at all.
  async bulkCreate(req: AuthedRequest, res: Response) {
    const inviter = req.user;
    if (!inviter) {
      return res.status(401).json({ message: "no inviter found" });
    }

    const {
      role,
      requestors,
      state,
      windCategory,
      departmentId,
      departmentIds,
      categoryIds,
      supportLevel,
    } = req.body;

    if (!role) {
      return res.status(400).json({ message: "role is required" });
    }
    if (!Array.isArray(requestors) || requestors.length === 0) {
      return res.status(400).json({ message: "No rows were provided" });
    }

    const isExecutiveRole = role === "HOD" || role === "CXO";
    const isAgentRole = role === "AGENT";

    // For HOD/CXO and AGENT, validate every department id referenced
    // anywhere in the batch up front (one query) so a bad id produces a
    // clear per-row reason instead of a raw Prisma foreign-key error.
    let validDepartmentIds: Set<string> | null = null;
    if (isExecutiveRole || isAgentRole) {
      const allIds = new Set<string>();
      if (isExecutiveRole && Array.isArray(departmentIds)) departmentIds.forEach((id: unknown) => typeof id === "string" && allIds.add(id));
      if (isAgentRole && typeof departmentId === "string" && departmentId) allIds.add(departmentId);
      for (const raw of requestors) {
        if (isExecutiveRole && Array.isArray(raw?.departmentIds)) {
          raw.departmentIds.forEach((id: unknown) => {
            if (typeof id === "string") allIds.add(id);
          });
        }
        if (isAgentRole && typeof raw?.departmentId === "string" && raw.departmentId) {
          allIds.add(raw.departmentId);
        }
      }
      const found = await prisma.department.findMany({
        where: { id: { in: Array.from(allIds) } },
        select: { id: true },
      });
      validDepartmentIds = new Set(found.map((d: { id: string }) => d.id));
    }

    const created: string[] = [];
    const skipped: { name: string; email: string; reason: string }[] = [];
    const seenInFile = new Set<string>();

    for (const raw of requestors) {
      const name = typeof raw?.name === "string" ? raw.name.trim() : "";
      const email = typeof raw?.email === "string" ? raw.email.trim().toLowerCase() : "";

      if (!name || !email) {
        skipped.push({ name, email, reason: "Missing name or email" });
        continue;
      }
      if (seenInFile.has(email)) {
        skipped.push({ name, email, reason: "Duplicate row in uploaded file" });
        continue;
      }
      seenInFile.add(email);

      // Per-row departments (HOD/CXO) if the row provided them, otherwise
      // fall back to the shared departmentIds/departmentId from the body.
      const rowDepartmentIds: string[] = isExecutiveRole
        ? (Array.isArray(raw?.departmentIds) && raw.departmentIds.length > 0
            ? raw.departmentIds.filter((id: unknown) => typeof id === "string")
            : (Array.isArray(departmentIds) ? departmentIds : []))
        : [];

      if (isExecutiveRole) {
        if (rowDepartmentIds.length === 0) {
          skipped.push({ name, email, reason: "No department assigned to this row" });
          continue;
        }
        const invalidIds = rowDepartmentIds.filter((id) => !validDepartmentIds!.has(id));
        if (invalidIds.length > 0) {
          skipped.push({ name, email, reason: "One or more assigned departments no longer exist" });
          continue;
        }
      }

      // Per-row department/categories/state/windCategory (AGENT) if the
      // row provided them, otherwise fall back to the shared values.
      const rowDepartmentId: string = isAgentRole
        ? (typeof raw?.departmentId === "string" && raw.departmentId ? raw.departmentId : (departmentId || ""))
        : (departmentId || "");
      const rowCategoryIds: string[] = isAgentRole
        ? (Array.isArray(raw?.categoryIds) && raw.categoryIds.length > 0
            ? raw.categoryIds.filter((id: unknown) => typeof id === "string")
            : (Array.isArray(categoryIds) ? categoryIds : []))
        : (categoryIds || []);
      const rowState: string = isAgentRole
        ? (typeof raw?.state === "string" && raw.state ? raw.state : (state || ""))
        : (role === "AGENT" ? (state || "") : "");
      const rowWindCategory = isAgentRole
        ? (raw?.windCategory || windCategory || null)
        : (role === "AGENT" ? (windCategory || null) : null);

      if (isAgentRole) {
        if (!rowDepartmentId) {
          skipped.push({ name, email, reason: "No department assigned to this row" });
          continue;
        }
        if (!validDepartmentIds!.has(rowDepartmentId)) {
          skipped.push({ name, email, reason: "Assigned department no longer exists" });
          continue;
        }
        if (!rowWindCategory) {
          skipped.push({ name, email, reason: "No wind category assigned to this row" });
          continue;
        }
        if (rowCategoryIds.length === 0) {
          skipped.push({ name, email, reason: "No category assigned to this row" });
          continue;
        }
      }

      try {
        await invitationService.createInvitation({
          inviter: { id: inviter.id, role: inviter.role },
          email,
          role,
          name,
          state: rowState,
          windCategory: rowWindCategory,
          departmentId: rowDepartmentId,
          departmentIds: isExecutiveRole ? rowDepartmentIds : [],
          categoryIds: rowCategoryIds,
          supportLevel,
        });
        created.push(email);
      } catch (err) {
        //@ts-ignore
        const reason = err instanceof InvitationError ? err.message : (err?.message || "Could not invite this row");
        skipped.push({ name, email, reason });
      }
    }

    return res.status(200).json({
      totalRows: requestors.length,
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
      skipped,
    });
  },

  // POST /invitations/accept  (public - invitee lands here from the emailed link)
  // Creates the account AND logs them in, same as a signup+login combo.
  async accept(req: AuthedRequest, res: Response) {
    const { user, token } = await invitationService.acceptInvitation({
      token: req.body.token,
      fullName: req.body.fullName,
      password: req.body.password,
    });
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role,departments : [...user.managedDepartments.map(dept => dept.id),...user.coxDepartements.map(dept => dept.id),user.assignedDepartment?.id] },
    });
  },

  // GET /invitations (GLOBAL_ADMIN, DEPT_ADMIN)
  async list(req: AuthedRequest, res: Response) {
    const invitations = await prisma.invitation.findMany({
      orderBy: { createdAt: "desc" },
      select:{
        id : true,
        role : true,
        email: true,
        status : true,
        department:{
          select:{
            name : true
          }
        }
      }
    });
    res.json(invitations);
  },

  // POST /invitations/:id/resend
  async resend(req: AuthedRequest, res: Response) {
    const invitation = await invitationService.resendInvitation(req.params.id);
    res.json(invitation);
  },

  // POST /invitations/:id/cancel
  async cancel(req: AuthedRequest, res: Response) {
    const invitation = await invitationService.cancelInvitation(req.params.id);
    res.json(invitation);
  },
};

