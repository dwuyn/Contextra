import { getSession } from "@/lib/auth";
import * as authService from "@/services/authService";
import * as projectService from "@/services/projectService";
import { DashboardView } from "@/components/DashboardView";
import { LandingView } from "@/components/LandingView";

export default async function HomePage() {
  const session = await getSession();
  if (!session) {
    return <LandingView />;
  }

  const [overview, user] = await Promise.all([
    projectService.getHomeOverview(session.userId),
    authService.getUser(session.userId),
  ]);

  if (!user) {
    return <LandingView />;
  }

  return <DashboardView user={user} overview={overview} />;
}
