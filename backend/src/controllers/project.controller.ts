import { Response } from "express";
import { AuthedRequest } from "../middleware/auth";
import { prisma } from "../lib/database";
import { AppError } from "../middleware/errorHandler";

export const projectController = {

    // GET /clients/:clientId/projects
    async getProjectsForClient(req: AuthedRequest, res: Response) {
        try {
            const { clientId } = req.params;

            const client = await prisma.client.findUnique({ where: { id: clientId } });
            if (!client) {
                throw new AppError("The client doesnt exist", 404);
            }

            const projects = await prisma.project.findMany({
                where: { clientId },
                orderBy: { createdAt: "desc" },
            });

            return res.status(200).json({
                success: true,
                count: projects.length,
                data: projects,
            });
        } catch (error) {
            console.error("Get Projects Error:", error);
            return res.status(500).json({
                success: false,
                message: "Internal Server Error",
            });
        }
    },

    // POST /clients/:clientId/projects
    async createProject(req: AuthedRequest, res: Response) {
        try {
            const { clientId } = req.params;
            const { name, isShutdownJob } = req.body;

            if (!name || !name.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Project name is required",
                });
            }

            const client = await prisma.client.findUnique({ where: { id: clientId } });
            if (!client) {
                throw new AppError("The client doesnt exist", 404);
            }

            const existCheck = await prisma.project.findFirst({
                where: {
                    clientId,
                    name: name.trim().toUpperCase(),
                },
            });

            if (existCheck) {
                throw new AppError("This project already exists for the client", 401);
            }

            const project = await prisma.project.create({
                data: {
                    name: name.trim().toUpperCase(),
                    isShutdownJob: Boolean(isShutdownJob),
                    clientId,
                },
            });

            return res.status(201).json({
                success: true,
                message: "Project created successfully",
                data: project,
            });
        } catch (error) {
            console.error("Create Project Error:", error);
            return res.status(500).json({
                success: false,
                message: "Internal Server Error",
            });
        }
    },

    // PUT /projects/:id
    async updateProject(req: AuthedRequest, res: Response) {
        try {
            const { id } = req.params;
            const { name, isShutdownJob } = req.body;

            const existingProject = await prisma.project.findUnique({ where: { id } });
            if (!existingProject) {
                throw new AppError("The project doesnt exist", 404);
            }

            const updatedProject = await prisma.project.update({
                where: { id },
                data: {
                    ...(name !== undefined && name.trim() ? { name: name.trim().toUpperCase() } : {}),
                    ...(isShutdownJob !== undefined ? { isShutdownJob: Boolean(isShutdownJob) } : {}),
                },
            });

            return res.status(200).json({
                success: true,
                message: "Project updated successfully",
                data: updatedProject,
            });
        } catch (error) {
            console.error("Update Project Error:", error);
            return res.status(500).json({
                success: false,
                message: "Internal Server Error",
            });
        }
    },

    // DELETE /projects/:id
    async deleteProject(req: AuthedRequest, res: Response) {
        try {
            const { id } = req.params;

            const existingProject = await prisma.project.findUnique({ where: { id } });
            if (!existingProject) {
                throw new AppError("The project doesnt exist", 404);
            }

            await prisma.project.delete({ where: { id } });

            return res.status(200).json({
                success: true,
                message: "Project deleted successfully",
            });
        } catch (error) {
            console.error("Delete Project Error:", error);
            return res.status(500).json({
                success: false,
                message: "Internal Server Error",
            });
        }
    },

}
