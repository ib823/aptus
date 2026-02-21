/** Phase 15: Circular dependency detection and topological sort for Data Migration objects */

interface GraphNode {
  id: string;
  dependsOn: string[];
}

interface WeightedNode extends GraphNode {
  estimatedDays: number;
}

/**
 * Detect whether adding a new dependency would create a circular dependency.
 * Uses DFS-based cycle detection.
 */
export function detectCircularDependency(
  objects: GraphNode[],
  newDep: { from: string; to: string },
): { circular: boolean; cycle: string[] } {
  // Build adjacency map: id -> list of IDs it depends on
  const adjMap = new Map<string, string[]>();
  for (const obj of objects) {
    adjMap.set(obj.id, [...obj.dependsOn]);
  }

  // Add the new dependency: "from" now depends on "to"
  const fromDeps = adjMap.get(newDep.from) ?? [];
  adjMap.set(newDep.from, [...fromDeps, newDep.to]);

  // Self-reference check
  if (newDep.from === newDep.to) {
    return { circular: true, cycle: [newDep.from, newDep.to] };
  }

  // DFS from "to" following dependsOn edges; if we reach "from" there's a cycle
  const visited = new Set<string>();
  const path: string[] = [];

  function dfs(current: string): boolean {
    if (current === newDep.from) {
      path.push(current);
      return true;
    }
    if (visited.has(current)) return false;
    visited.add(current);
    path.push(current);

    const deps = adjMap.get(current) ?? [];
    for (const dep of deps) {
      if (dfs(dep)) return true;
    }

    path.pop();
    return false;
  }

  const hasCycle = dfs(newDep.to);

  if (hasCycle) {
    return { circular: true, cycle: [newDep.from, ...path] };
  }

  return { circular: false, cycle: [] };
}

/**
 * Topological sort of graph nodes using Kahn's algorithm.
 * Returns IDs in dependency order (dependencies first).
 * Nodes not in any dependency chain are appended at the end.
 */
export function topologicalSort(objects: GraphNode[]): string[] {
  const ids = new Set(objects.map((o) => o.id));
  const adjMap = new Map<string, string[]>(); // id -> dependents (reverse edges)
  const inDegree = new Map<string, number>();

  for (const obj of objects) {
    adjMap.set(obj.id, []);
    inDegree.set(obj.id, 0);
  }

  for (const obj of objects) {
    for (const dep of obj.dependsOn) {
      if (ids.has(dep)) {
        const dependents = adjMap.get(dep);
        if (dependents) dependents.push(obj.id);
        inDegree.set(obj.id, (inDegree.get(obj.id) ?? 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const result: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);
    for (const dependent of adjMap.get(current) ?? []) {
      const newDegree = (inDegree.get(dependent) ?? 1) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) queue.push(dependent);
    }
  }

  return result;
}

/**
 * Compute the critical path through the dependency graph.
 * The critical path is the longest chain weighted by estimatedDays.
 * Uses topological sort then longest-path calculation.
 */
export function getCriticalPath(
  objects: WeightedNode[],
): { path: string[]; totalDays: number } {
  if (objects.length === 0) return { path: [], totalDays: 0 };

  const nodeMap = new Map(objects.map((o) => [o.id, o]));
  const sortedIds = topologicalSort(objects);

  // dist[id] = longest path ending at id
  const dist = new Map<string, number>();
  const predecessor = new Map<string, string | null>();

  for (const id of sortedIds) {
    const node = nodeMap.get(id);
    if (!node) continue;
    dist.set(id, node.estimatedDays);
    predecessor.set(id, null);
  }

  for (const id of sortedIds) {
    const node = nodeMap.get(id);
    if (!node) continue;
    const currentDist = dist.get(id) ?? 0;

    // Find dependents of this node
    for (const other of objects) {
      if (other.dependsOn.includes(id)) {
        const newDist = currentDist + other.estimatedDays;
        if (newDist > (dist.get(other.id) ?? 0)) {
          dist.set(other.id, newDist);
          predecessor.set(other.id, id);
        }
      }
    }
  }

  // Find the node with the maximum distance
  let maxDist = 0;
  let endNode = "";
  for (const [id, d] of dist) {
    if (d >= maxDist) {
      maxDist = d;
      endNode = id;
    }
  }

  if (!endNode) return { path: [], totalDays: 0 };

  // Reconstruct path
  const path: string[] = [];
  let current: string | null = endNode;
  while (current) {
    path.unshift(current);
    current = predecessor.get(current) ?? null;
  }

  return { path, totalDays: maxDist };
}
