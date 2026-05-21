import { processContinuityJobs } from "../src/services/continuityJobService";

const DEFAULT_POLL_MS = 5_000;

function readPositiveInt(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

async function sleep(ms: number) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main() {
  const once = process.env.CONTINUITY_WORKER_ONCE === "1";
  const limit = readPositiveInt("CONTINUITY_WORKER_BATCH_SIZE", 10);
  const pollMs = readPositiveInt("CONTINUITY_WORKER_POLL_MS", DEFAULT_POLL_MS);

  do {
    const result = await processContinuityJobs({ limit });
    console.log(
      JSON.stringify({
        event: "continuity_worker_batch",
        ...result,
        at: new Date().toISOString(),
      }),
    );

    if (once) break;
    if (result.processed === 0) {
      await sleep(pollMs);
    }
  } while (true);
}

main().catch((error) => {
  console.error("Continuity worker crashed:", error);
  process.exit(1);
});
