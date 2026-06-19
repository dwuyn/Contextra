import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import * as projectService from "@/services/projectService";
import { ProjectWorkspace } from "@/components/ProjectWorkspace";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  let projectName: string | undefined;
  try {
    const session = await getSession();
    if (session) {
      const project = await projectService.getProject(id, session.userId);
      projectName = project?.metadata?.name;
    }
  } catch {
  }
  return {
    title: projectName ?? "Project",
  };
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { id } = await params;
  const project = await projectService.getProject(id, session.userId);
  if (!project) {
    redirect("/");
  }

  return <ProjectWorkspace project={project} />;
}
