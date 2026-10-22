/**
 * HOW LONG THE REQUEST THREAD WAS KEPT FROM ITS EVENT LOOP (structural
 * hardening round 6). The containment suites assert that work the envelope
 * does (lib/contracts/envelope.ts) never blocks the thread that serves
 * requests. They used to measure the longest WALL-CLOCK gap between two
 * ticks of a timer. On a loaded runner (vitest runs files in parallel, the
 * envelope adds worker threads, CI shares its CPUs) the operating system
 * stretches those gaps by itself: 229-301 ms measured against limits of 200
 * and 250 for code that had not changed, so a green suite went red on a
 * re-run and a real regression could hide among the flakes.
 *
 * So a stall is measured in THIS THREAD'S CPU TIME between two ticks
 * (process.threadCpuUsage): what the thread itself spent running instead of
 * turning its event loop — the synchronous work under test — and not the
 * time other processes and threads held the CPU. Contention does not add to
 * it; a loop with no await does, whatever the machine is doing. (A thread
 * that BLOCKS without running — a synchronous sleep or wait — would not
 * show; nothing on the request path does that, and `wallMs` still reports
 * the wall-clock gap for a test that wants it.)
 *
 * Where Node has no per-thread CPU clock, the wall-clock gap stands in.
 */

type ThreadCpu = () => { user: number; system: number };

/** This thread's CPU time in ms, or null where Node does not measure it. */
function threadCpuMs(): number | null {
  const usage = (process as { threadCpuUsage?: ThreadCpu }).threadCpuUsage;
  if (typeof usage !== "function") return null;
  const u = usage.call(process);
  return (u.user + u.system) / 1000;
}

export interface Stall<T> {
  value: T;
  /** The most CPU this thread spent between two ticks of the event loop (ms). */
  ms: number;
  /** The longest wall-clock gap between two ticks (ms): stretched by a loaded machine, so not what tests assert on. */
  wallMs: number;
}

/** Run `work` with a `tickMs` ticker on the event loop: the longest stall, in this thread's CPU time, while it ran. */
export async function longestStall<T>(work: () => Promise<T>, tickMs = 5): Promise<Stall<T>> {
  let longestCpu = 0;
  let longestWall = 0;
  let lastWall = performance.now();
  let lastCpu = threadCpuMs();
  const look = () => {
    const wall = performance.now();
    const cpu = threadCpuMs();
    longestWall = Math.max(longestWall, wall - lastWall);
    longestCpu = Math.max(longestCpu, cpu === null || lastCpu === null ? wall - lastWall : cpu - lastCpu);
    lastWall = wall;
    lastCpu = cpu;
  };
  const ticker = setInterval(look, tickMs);
  try {
    const value = await work();
    look();
    return { value, ms: longestCpu, wallMs: longestWall };
  } finally {
    clearInterval(ticker);
  }
}
