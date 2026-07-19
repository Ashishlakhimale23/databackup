/**
 * seedDemo.ts
 * ---------------------------------------------------------------------------
 * Populates demo data so the CXO analytics console (CXODashboardmock.tsx,
 * fed by GET /cxo-dashboard/analytics) has something real to render.
 *
 * This is intentionally separate from seed.ts (which just seeds the base
 * department/category/keyword/client taxonomy with no users or tickets) —
 * run seed.ts first if you haven't, then run this. It's self-contained and
 * safe to re-run: departments/users are upserted by a unique key, and ticket
 * generation is skipped entirely if demo tickets already exist.
 *
 * Usage:
 *   npx ts-node src/lib/seedDemo.ts
 *
 * Login as the demo CXO with:
 *   email:    cxo.demo@sanghvi.com
 *   password: Demo@12345
 * ---------------------------------------------------------------------------
 */

import {
  UserRole,
  SupportLevel,
  TicketPriority,
  TicketStatus,
  ApprovalStatus,
} from "../generated/prisma/client";
import { prisma } from "./database";
import bcrypt from "bcryptjs";

const DEMO_PASSWORD = "Demo@12345";

// ── seeded PRNG so re-runs produce the same *shape* of data (status mix,
// spread across departments, etc.) even though timestamps are relative to
// "now" and will differ run to run. ──────────────────────────────────────
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260719);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
const randInt = (min: number, max: number) => Math.floor(min + rng() * (max - min + 1));

// ============================================================================
// Demo org structure — a handful of departments under one CXO, each with a
// small category list. Kept separate from seed.ts's DEPARTMENTS map so this
// script has no import-time side effects (seed.ts runs main() on import).
// ============================================================================

const DEMO_DEPARTMENTS: Record<
  string,
  { description: string; categories: { name: string; defaultSlaMinutes: number; defaultPriority: TicketPriority }[] }
> = {
  "IT Support": {
    description: "Network, hardware, and software support",
    categories: [
      { name: "Network & VPN", defaultSlaMinutes: 240, defaultPriority: TicketPriority.P1 },
      { name: "Hardware", defaultSlaMinutes: 1440, defaultPriority: TicketPriority.P3 },
      { name: "Software Install", defaultSlaMinutes: 1440, defaultPriority: TicketPriority.P3 },
      { name: "Access & Permissions", defaultSlaMinutes: 720, defaultPriority: TicketPriority.P2 },
    ],
  },
  "Facilities & Admin": {
    description: "Site maintenance, housekeeping, and asset requests",
    categories: [
      { name: "Maintenance Request", defaultSlaMinutes: 1440, defaultPriority: TicketPriority.P2 },
      { name: "Housekeeping", defaultSlaMinutes: 2880, defaultPriority: TicketPriority.P4 },
      { name: "Security & Access", defaultSlaMinutes: 480, defaultPriority: TicketPriority.P2 },
      { name: "Asset Request", defaultSlaMinutes: 2880, defaultPriority: TicketPriority.P3 },
    ],
  },
  "HR Operations": {
    description: "Payroll, leave, onboarding, and policy queries",
    categories: [
      { name: "Payroll Query", defaultSlaMinutes: 1440, defaultPriority: TicketPriority.P2 },
      { name: "Leave & Attendance", defaultSlaMinutes: 720, defaultPriority: TicketPriority.P3 },
      { name: "Onboarding", defaultSlaMinutes: 2880, defaultPriority: TicketPriority.P3 },
      { name: "Policy Clarification", defaultSlaMinutes: 4320, defaultPriority: TicketPriority.P4 },
    ],
  },
  "Finance & Accounts": {
    description: "Reimbursements, vendor payments, and budget approvals",
    categories: [
      { name: "Reimbursement", defaultSlaMinutes: 2880, defaultPriority: TicketPriority.P3 },
      { name: "Vendor Payment", defaultSlaMinutes: 1440, defaultPriority: TicketPriority.P2 },
      { name: "Invoice Query", defaultSlaMinutes: 1440, defaultPriority: TicketPriority.P3 },
      { name: "Budget Approval", defaultSlaMinutes: 4320, defaultPriority: TicketPriority.P4 },
    ],
  },
};

const SITE_POOL = [
  "Maharashtra", "Karnataka", "Delhi", "Tamil Nadu", "Telangana",
  "Gujarat", "West Bengal", "Uttar Pradesh", "Haryana", "Rajasthan",
];

const CLIENT_POOL = [
  "Nimbus Logistics", "Everest Foods Ltd", "Solstice Retail", "Vantage Manufacturing",
  "BluePeak Textiles", "Coral Bay Hospitality", "Meridian Pharma", "Zenith Motors",
  "Harbor Freight Co", "Crestline Realty", "Oakwood Analytics", "Silverline Insurance",
];

const TITLE_TEMPLATES = [
  "Issue with {cat} at {site} site",
  "Request: {cat} for {client}",
  "{cat} not resolved since last week",
  "Follow-up on {cat}",
  "Urgent — {cat} blocking work at {site}",
  "{client} raised a concern about {cat}",
];

const STATUS_WEIGHTS: [TicketStatus, number][] = [
  [TicketStatus.OPEN, 0.24],
  [TicketStatus.IN_PROGRESS, 0.22],
  [TicketStatus.ON_HOLD, 0.10],
  [TicketStatus.REOPENED, 0.05],
  [TicketStatus.RESOLVED, 0.39],
];
function weightedStatus(): TicketStatus {
  const r = rng();
  let acc = 0;
  for (const [s, w] of STATUS_WEIGHTS) {
    acc += w;
    if (r <= acc) return s;
  }
  return TicketStatus.RESOLVED;
}

const slaHoursForPriority = (p: TicketPriority) =>
  p === TicketPriority.P1 ? 4 : p === TicketPriority.P2 ? 24 : p === TicketPriority.P3 ? 72 : 120;

async function main() {
  // ── 1. Requesters (generic pool, not tied to any one department) ───────
  const REQUESTER_NAMES = [
    "Aarav Sharma", "Priya Nair", "Rohan Mehta", "Ishita Kapoor", "Kabir Singh",
    "Ananya Iyer", "Vivaan Joshi", "Diya Reddy", "Aditya Rao", "Meera Pillai",
  ];
  const requesterPasswordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const requesters = [];
  for (const [i, name] of REQUESTER_NAMES.entries()) {
    const email = `requester.demo${i + 1}@sanghvi.com`;
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          fullName: name,
          passwordHash: requesterPasswordHash,
          role: UserRole.REQUESTER,
          approvalStatus: ApprovalStatus.APPROVED,
        },
      });
    }
    requesters.push(user);
  }

  // ── 2. CXO ───────────────────────────────────────────────────────────
  const cxoEmail = "cxo.demo@sanghvi.com";
  const cxoPasswordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  let cxo = await prisma.user.findUnique({ where: { email: cxoEmail } });
  if (!cxo) {
    cxo = await prisma.user.create({
      data: {
        email: cxoEmail,
        fullName: "Demo CXO",
        passwordHash: cxoPasswordHash,
        role: UserRole.CXO,
      },
    });
  }

  // ── 3. Departments (+ HOD, agents, categories) under the CXO ────────────
  type DeptCategory = { id: string; name: string; defaultSlaMinutes: number | null };
  type DeptCtx = { id: string; categories: DeptCategory[]; agentIds: string[] };
  const deptCtxByName: Record<string, DeptCtx> = {};

  for (const [deptName, deptData] of Object.entries(DEMO_DEPARTMENTS)) {
    let department = await prisma.department.findFirst({ where: { name: deptName, cxoId: cxo.id } });

    if (!department) {
      const hodEmail = `hod.${deptName.toLowerCase().replace(/[^a-z]+/g, ".")}@sanghvi.com`;
      let hod = await prisma.user.findUnique({ where: { email: hodEmail } });
      if (!hod) {
        hod = await prisma.user.create({
          data: {
            email: hodEmail,
            fullName: `${deptName} HOD`,
            passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
            role: UserRole.HOD,
          },
        });
      }

      department = await prisma.department.create({
        data: {
          name: deptName,
          description: deptData.description,
          managerId: hod.id,
          cxoId: cxo.id,
        },
      });

      await prisma.ticketCategory.createMany({
        data: deptData.categories.map((c) => ({
          departmentId: department!.id,
          name: c.name,
          defaultSlaMinutes: c.defaultSlaMinutes,
          defaultPriority: c.defaultPriority,
        })),
      });
    }

    const categories = await prisma.ticketCategory.findMany({
      where: { departmentId: department.id },
      select: { id: true, name: true, defaultSlaMinutes: true },
    });

    // Two agents per department, idempotent on email.
    const agentIds: string[] = [];
    for (let i = 1; i <= 2; i++) {
      const agentEmail = `agent.${deptName.toLowerCase().replace(/[^a-z]+/g, ".")}${i}@sanghvi.com`;
      let agent = await prisma.user.findUnique({ where: { email: agentEmail } });
      if (!agent) {
        agent = await prisma.user.create({
          data: {
            email: agentEmail,
            fullName: `${deptName} Agent ${i}`,
            passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
            role: UserRole.AGENT,
            agentsdepartmentId: department.id,
            supportLevel: i === 1 ? SupportLevel.L2 : SupportLevel.L1,
          },
        });
      }
      agentIds.push(agent.id);
    }

    deptCtxByName[deptName] = { id: department.id, categories, agentIds };
  }

  // ── 4. Tickets — skip entirely if this script already ran once ─────────
  const existingDemoTickets = await prisma.ticket.count({ where: { ticketNumber: { startsWith: "DEMO-" } } });
  if (existingDemoTickets > 0) {
    console.log(`Demo tickets already exist (${existingDemoTickets}), skipping ticket generation.`);
    console.log(`CXO login -> email: ${cxoEmail}  password: ${DEMO_PASSWORD}`);
    return;
  }

  const deptNames = Object.keys(deptCtxByName);
  const now = new Date();
  const TICKET_COUNT = 640;
  const ticketsData = [];

  for (let i = 0; i < TICKET_COUNT; i++) {
    const deptName = pick(deptNames);
    const dept = deptCtxByName[deptName];
    const category = dept.categories.length ? pick(dept.categories) : undefined;
    const categoryId = category?.id ?? null;

    const daysAgo = randInt(0, 89);
    const createdAt = new Date(now.getTime() - daysAgo * 86400000 - randInt(0, 86399) * 1000);
    const status = weightedStatus();
    const priority = pick<TicketPriority>([
      TicketPriority.P1, TicketPriority.P2, TicketPriority.P2,
      TicketPriority.P3, TicketPriority.P3, TicketPriority.P4,
    ]);

    const slaHours = category?.defaultSlaMinutes ? category.defaultSlaMinutes / 60 : slaHoursForPriority(priority);
    const slaDeadline = new Date(createdAt.getTime() + slaHours * 3600000);

    const isResolved = status === TicketStatus.RESOLVED;
    const resolutionHours = Math.max(0.5, rng() * slaHours * 1.6);
    const resolvedAt = isResolved ? new Date(createdAt.getTime() + resolutionHours * 3600000) : null;
    const referenceNow = isResolved ? (resolvedAt as Date) : now;
    const slaBreached = referenceNow.getTime() > slaDeadline.getTime();

    const site = pick(SITE_POOL);
    const client = pick(CLIENT_POOL);
    const catName = category?.name ?? "General Request";
    const title = pick(TITLE_TEMPLATES)
      .replace("{cat}", catName)
      .replace("{site}", site)
      .replace("{client}", client);

    const assigneeId = status === TicketStatus.OPEN ? null : pick(dept.agentIds);

    ticketsData.push({
      ticketNumber: `DEMO-${3000 + i}`,
      title,
      requesterId: pick(requesters).id,
      departmentId: dept.id,
      categoryId,
      clientName: client,
      clientEmail: `contact@${client.toLowerCase().replace(/[^a-z]+/g, "")}.com`,
      dateOfOccurance: createdAt,
      site,
      status,
      priority,
      assigneeId,
      slaDeadline: isResolved ? null : slaDeadline,
      slaBreached,
      resolvedAt,
      turnOverTime: isResolved ? resolutionHours * 3600 : null, // seconds
      createdAt,
    });
  }

  await prisma.ticket.createMany({ data: ticketsData });

  console.log(`Seeded ${ticketsData.length} demo tickets across ${deptNames.length} departments.`);
  console.log(`CXO login -> email: ${cxoEmail}  password: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
