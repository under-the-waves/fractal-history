# Anchor Deduplication System

## Problem

When the same anchor is selected from different pathways (e.g., "Ideological Conflict: Capitalism vs. Communism" reached from both Cold War and Economic Systems), the system currently:
1. Creates duplicate anchors in the database
2. Generates different children for each duplicate
3. Wastes LLM tokens
4. Confuses users with inconsistent content

## Solution: Deduplication Before Generation

Before generating children for a newly proposed anchor, check if that anchor **already exists elsewhere in the tree**. If it does, **reuse the existing anchor and all its children**.

---

## Implementation Strategy

### Phase 1: Detection (When A-anchors are selected)

After the LLM proposes A-anchors but BEFORE inserting them into the database:

1. **Extract proposed anchor titles** from LLM response
2. **Search database** for existing anchors with matching titles
3. **For each match found:**
   - Instead of creating a new anchor, create a new **tree_position** pointing to the existing anchor
   - Copy over all existing child tree_positions (maintaining the same anchor relationships)

### Phase 2: Database Lookup Function

Add a new helper function in `/api/generate-anchors.js`:

```javascript
// Check if an anchor with this title already exists anywhere in the tree
async function findExistingAnchor(title) {
    const cleanTitle = title.trim().toLowerCase();
    
    const results = await sql`
        SELECT id, title, scope 
        FROM anchors 
        WHERE LOWER(TRIM(title)) = ${cleanTitle}
        LIMIT 1
    `;
    
    return results.length > 0 ? results[0] : null;
}

// Get all tree_positions for an anchor (for copying the subtree)
async function getAnchorSubtree(anchorId) {
    const positions = await sql`
        SELECT * FROM tree_positions
        WHERE anchor_id = ${anchorId}
    `;
    
    return positions;
}

// Recursively copy all descendants of an anchor to a new parent location
async function copyAnchorSubtree(sourceAnchorId, newParentPositionId, breadth, position) {
    // Get the source anchor's existing tree position
    const sourcePositions = await getAnchorSubtree(sourceAnchorId);
    
    if (sourcePositions.length === 0) {
        return null; // Anchor doesn't exist in tree yet
    }
    
    // Use the first position (anchors can appear multiple times in tree)
    const sourcePosition = sourcePositions[0];
    
    // Create new position for this anchor under new parent
    const newPositionId = `${sourcePosition.level}${breadth}-${generateHash()}`;
    
    await sql`
        INSERT INTO tree_positions (position_id, anchor_id, parent_position_id, level, breadth, position)
        VALUES (
            ${newPositionId},
            ${sourceAnchorId},
            ${newParentPositionId},
            ${sourcePosition.level},
            ${breadth},
            ${position}
        )
    `;
    
    // Now recursively copy all children
    const children = await sql`
        SELECT * FROM tree_positions
        WHERE parent_position_id = ${sourcePosition.position_id}
        ORDER BY position ASC
    `;
    
    for (const child of children) {
        await copyAnchorSubtree(child.anchor_id, newPositionId, child.breadth, child.position);
    }
    
    return newPositionId;
}
```

### Phase 3: Modify Anchor Insertion Logic

In the main handler, **BEFORE** the loop that inserts anchors:

```javascript
// Parse the LLM response to extract anchor data
const anchors = breadth === 'A' 
    ? parseAnchorResponse(response, parentId)
    : parseTemporalAnchorResponse(response, parentId);

// DEDUPLICATION CHECK
const insertedAnchors = [];
for (const anchor of anchors) {
    // Check if this anchor already exists
    const existingAnchor = await findExistingAnchor(anchor.title);
    
    if (existingAnchor) {
        console.log(`Found existing anchor: ${existingAnchor.title} (${existingAnchor.id})`);
        
        // Get parent position info
        const parentPositions = await sql`
            SELECT position_id, level FROM tree_positions 
            WHERE anchor_id = ${parentId}
            LIMIT 1
        `;
        
        const parentPosId = parentPositions[0].position_id;
        const childLevel = parentPositions[0].level + 1;
        
        // Copy the existing anchor and its entire subtree to this location
        const newPositionId = await copyAnchorSubtree(
            existingAnchor.id,
            parentPosId,
            breadth,
            anchor.position
        );
        
        insertedAnchors.push({
            id: existingAnchor.id,
            title: existingAnchor.title,
            scope: existingAnchor.scope,
            generation_status: 'complete', // Already exists
            level: childLevel,
            breadth,
            position: anchor.position,
            isReused: true // Flag for debugging
        });
        
    } else {
        // Create new anchor (existing logic)
        const anchorId = generateAnchorId(parentId, anchor.position);
        
        const [insertedAnchor] = await sql`
            INSERT INTO anchors (id, title, scope, generation_status)
            VALUES (${anchorId}, ${anchor.title}, ${anchor.scope}, 'pending')
            RETURNING id, title, scope, generation_status
        `;
        
        // ... rest of existing insertion logic ...
        
        insertedAnchors.push({
            ...insertedAnchor,
            level: childLevel,
            breadth,
            position: anchor.position,
            isReused: false
        });
    }
}
```

---

## Benefits

1. âœ… **Consistency**: Same anchor always has same children, regardless of pathway
2. âœ… **Efficiency**: Don't regenerate content that already exists
3. âœ… **Multiple Pathways**: Users can discover same content through different routes (fractal property!)
4. âœ… **Cost Savings**: Fewer LLM API calls

---

## Edge Cases to Handle

### Case 1: Anchor exists but has no children yet
- Still reuse the anchor
- Children can be generated later when user explores it

### Case 2: Anchor exists with different scope
- Current implementation uses **title matching only**
- Could enhance to also check scope similarity
- For MVP: exact title match is sufficient

### Case 3: Circular references
- Example: Industrial Revolution â†’ Capitalism â†’ Industrial Revolution
- The anti-circularity rules in the prompt should prevent this
- But database should have checks to prevent infinite loops
- **Solution**: Track ancestor IDs and refuse to copy if it would create a cycle

### Case 4: Case sensitivity and whitespace
- Use `LOWER(TRIM(title))` for matching
- Handles "Industrial Revolution" = "industrial revolution" = " Industrial Revolution "

---

## Testing

After implementing:

1. Generate A-anchors under different parents that might select same anchor
2. Verify that only ONE anchor record is created
3. Verify that MULTIPLE tree_positions are created pointing to same anchor
4. Verify that children appear under BOTH pathways
5. Check database:
   ```sql
   -- Should see multiple positions for same anchor_id
   SELECT anchor_id, COUNT(*) 
   FROM tree_positions 
   GROUP BY anchor_id 
   HAVING COUNT(*) > 1;
   ```

---

## Implementation Priority

This is a **medium priority** feature:
- **Don't need immediately** - system works without it
- **Should implement soon** - prevents data inconsistency and wasted tokens
- **Before scale-up** - definitely want this before generating hundreds of anchors

Suggested order:
1. âœ… Fix current UI issues (button centering, etc.)
2. âœ… Update prompts (no quotes, geographic instances, date formatting)
3. â­ï¸ Implement deduplication (next major feature)
4. â­ï¸ Generate Breadth-C anchors (geographic)

---

Let me know if you want me to implement this deduplication system now or if you want to tackle the prompt updates and UI fixes first!
