# Future Idea: 3D Breadth Visualization

## Core Concept

Replace 2D boxes with **3D cubes or hexagonal prisms** to represent breadth dimensions, with children appearing as **colored shadows** of the parent's active face.

## Visual Metaphor

**Parent Node (3D):**
- Rendered as cube/hexagonal prism with multiple faces
- Each face represents a different breadth level (A, B, C, etc.)
- Each face has distinct color (blue=A, green=B, orange=C)
- Rotate the shape to switch between breadth perspectives

**Children (2D Shadows):**
- Appear as flat, shadow-like projections below parent
- Inherit color from parent's currently visible face
- Visual metaphor: "These are the projections of viewing the parent from THIS angle"
- When clicked/expanded, child "lifts up" and becomes 3D itself

## Depth Gradient

Create visual hierarchy through progressive flattening:
- **Level 0 (ROOT):** Brightest, most solid 3D
- **Level 1:** Slightly faded 3D when expanded
- **Level 2:** More faded, lighter shadows
- **Level 3:** Lightest, "shadows of shadows"

Users can literally SEE how deep they are by how faint/flat the nodes become.

## Implementation Options

1. **Full 3D:** Three.js or CSS 3D transforms (most impressive, complex)
2. **Isometric 2.5D:** Strategy game style (good balance)
3. **Illustrated:** Pre-rendered cube sprites (simplest, still effective)

## Key Benefits

- **Intuitive metaphor:** Rotation = different perspectives on same content
- **Fractal representation:** Shadows-of-shadows captures recursive structure
- **Visual depth cues:** Immediately obvious how deep you are in tree
- **Unique aesthetic:** No other educational tool uses this approach

## Design Challenges to Solve

- How do users discover they can rotate?
- How to keep text readable on angled faces?
- Performance with many animated 3D nodes?
- Cognitive load of 3D manipulation vs. simple buttons?

## Possible Compromise

Keep visual metaphor but simplify interaction:
- Nodes illustrated as 3D cubes (isometric)
- A/B/C buttons rotate the cube (animated transition)
- Children as flat colored shadows
- Direct manipulation feels magical but may not be necessary

## Status

**Idea stage** - not yet implemented. Current implementation uses 2D boxes with colored top accent bars and A/B/C toggle buttons.

---

*This represents a significant visual upgrade that could make Fractal History truly distinctive. Worth revisiting once core functionality is solid.*
