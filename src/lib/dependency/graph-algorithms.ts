/**
 * Graph algorithms for dependency validation and cycle detection.
 *
 * - Tarjan's SCC: Identifies exact cycle members for error reporting.
 * - Kahn's Topological Sort: Cycle detection during registration (O(V+E)).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DirectedEdge {
  source: string;
  target: string;
}

export interface SCCResult {
  /** All strongly connected components with 2+ nodes (i.e., cycles). */
  cycles: string[][];
  /** True if the graph is a DAG (no cycles). */
  isDAG: boolean;
}

export interface TopologicalSortResult {
  /** Topologically sorted node IDs (empty if cycles exist). */
  sorted: string[];
  /** True if all nodes are covered (no cycles). */
  isDAG: boolean;
  /** Nodes not reachable by Kahn's algorithm (involved in cycles). */
  cycleNodes: string[];
}

// ---------------------------------------------------------------------------
// Tarjan's Strongly Connected Components — O(V+E)
// ---------------------------------------------------------------------------

export function tarjanSCC(nodes: string[], edges: DirectedEdge[]): SCCResult {
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    adj.set(n, []);
  }
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
  }

  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const sccs: string[][] = [];

  function strongconnect(v: string) {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) ?? []) {
      if (!indices.has(w)) {
        strongconnect(w);
        lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      sccs.push(scc);
    }
  }

  for (const n of nodes) {
    if (!indices.has(n)) {
      strongconnect(n);
    }
  }

  // Only return SCCs with 2+ nodes (actual cycles)
  const cycles = sccs.filter((scc) => scc.length > 1);
  return { cycles, isDAG: cycles.length === 0 };
}

// ---------------------------------------------------------------------------
// Kahn's Topological Sort — O(V+E)
// ---------------------------------------------------------------------------

export function kahnTopologicalSort(
  nodes: string[],
  edges: DirectedEdge[],
): TopologicalSortResult {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n, 0);
    adj.set(n, []);
  }

  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [n, deg] of inDegree) {
    if (deg === 0) queue.push(n);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    for (const neighbor of adj.get(current) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  const isDAG = sorted.length === nodes.length;
  const sortedSet = new Set(sorted);
  const cycleNodes = isDAG ? [] : nodes.filter((n) => !sortedSet.has(n));

  return { sorted, isDAG, cycleNodes };
}
