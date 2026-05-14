import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getHomeOverview } from "@/actions/projects";
import { getUser } from "@/actions/auth";
import { DashboardView } from "@/components/DashboardView";
import { LandingView } from "@/components/LandingView";

export default async function HomePage() {
  const session = await getSession();
  if (!session) {
    return <LandingView />;
  }

  const [overview, user] = await Promise.all([
    getHomeOverview(),
    getUser()
  ]);

  if (!user) {
    return <LandingView />;
  }

  return <DashboardView user={user} overview={overview} />;
}
