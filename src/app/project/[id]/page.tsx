import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProject } from "@/actions/projects";
import { ProjectWorkspace } from "@/components/ProjectWorkspace";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { id } = await params;
  const project = await getProject(id);
  if (!project) {
    redirect("/");
  }

  return <ProjectWorkspace project={project as any} />;
}
