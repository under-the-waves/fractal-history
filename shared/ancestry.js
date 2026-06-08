// Pure ancestry-path helpers shared by the anchor-generation backend (api/) and
// the "You Are Here" orientation panel frontend (src/). No Node or browser APIs,
// so it bundles safely in either runtime.
//
// Ancestor arrays are ordered ROOT-FIRST (ascending level). The LAST element is
// the current/parent node itself, so "nearest" means scanning from the end.
//
// Each element is expected to carry at least a `breadth` field:
//   'A' = analytical (theme/frame), 'B' = temporal (when), 'C' = geographic (where),
//   null/undefined for the root.

// The nearest ancestor (or the current node itself, if it is last in the array)
// whose breadth matches. Returns null if none.
export function nearestAncestorOfBreadth(ancestors, breadth) {
  if (!Array.isArray(ancestors)) return null;
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i];
    if (a && a.breadth === breadth) return a;
  }
  return null;
}

// All analytical (A) ancestors, root-first. The last is the nearest/primary lens;
// earlier ones provide broader context. Analytical framing is inherited ONLY from
// these — never from temporal (B) or geographic (C) nodes.
export function analyticalAncestors(ancestors) {
  if (!Array.isArray(ancestors)) return [];
  return ancestors.filter(a => a && a.breadth === 'A');
}

// The three axes the tree is built on, for the orientation panel. Because the
// current node is passed as the last element, an axis resolves to the current
// node when it is itself that breadth. Any axis may be null (no such ancestor).
export function orientationAxes(ancestors) {
  return {
    frame: nearestAncestorOfBreadth(ancestors, 'A'), // analytical lens
    when: nearestAncestorOfBreadth(ancestors, 'B'),  // temporal scope
    where: nearestAncestorOfBreadth(ancestors, 'C'), // geographic scope
  };
}
