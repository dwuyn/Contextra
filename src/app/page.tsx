import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getHomeOverview } from "@/actions/projects";
import { getUser } from "@/actions/auth";
import { DashboardView } from "@/components/DashboardView";

export default async function HomePage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const [overview, user] = await Promise.all([
    getHomeOverview(),
    getUser()
  ]);

  if (!user) {
    redirect("/login");
  }

  return <DashboardView user={user} overview={overview} />;
}
