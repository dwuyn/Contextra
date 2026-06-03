import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import * as projectService from "@/services/projectService";
import { ProjectWorkspace } from "@/components/ProjectWorkspace";

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
