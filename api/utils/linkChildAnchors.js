/**
 * Post-process narrative HTML to convert child anchor markers
 * into styled navigational links.
 *
 * Supports two patterns:
 * 1. <strong>Exact Title</strong>  (where titles read naturally in prose)
 * 2. <strong data-title='Exact Title'>prose-friendly text</strong>  (decoupled display
 *    text; single or double quotes accepted. Single quotes are preferred because they
 *    need no escaping inside the JSON narrative string the model returns.)
 */

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Escape a string for safe use inside a double-quoted HTML attribute.
function escapeAttr(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Replace child anchor markers with styled links to that child's narrative.
 * @param {string} html - The narrative HTML string
 * @param {Array<{id: string, title: string}>} children - Child anchor objects
 * @param {string} breadth - The breadth of the current narrative ('A', 'B', etc.)
 * @returns {string} HTML with child anchor titles converted to links
 */
function linkChildAnchors(html, children, breadth, pathPrefix = []) {
    if (!html || !children || children.length === 0) return html;

    const breadthClass = breadth === 'B' ? 'sub-anchor-link-temporal' : 'sub-anchor-link-analytical';

    let result = html;
    for (const child of children) {
        // The exact sub-anchor title, shown as a hover tooltip so readers can see what
        // a prose phrase actually links to (e.g. "the late republic" -> "Late Republic: ...").
        const attrTitle = escapeAttr(child.title);

        // Sub-anchor links go to the tree visualization, expanded to this anchor, rather
        // than to its narrative. The path is the ancestor chain (root -> current anchor)
        // plus this child; ids encode their own breadth so the tree can walk straight to it.
        const treeHref = `/tree?path=${[...pathPrefix, child.id].join(',')}`;

        // Pattern 1: <strong data-title='Exact Title'>display text</strong>
        // Quote char is captured (group 1) and backreferenced (\1) so the opening and
        // closing quotes must match. Accepts both ' and " for backward compatibility.
        const dataPattern = new RegExp(
            `<strong\\s+data-title=(["'])${escapeRegex(child.title)}\\1>(.*?)</strong>`,
            'g'
        );
        result = result.replace(dataPattern, (_, _quote, displayText) =>
            `<a href="${treeHref}" class="sub-anchor-link ${breadthClass}" title="${attrTitle}">${displayText}</a>`
        );

        // Pattern 2: <strong>Exact Title</strong> (fallback for A/C or older narratives)
        const plainPattern = new RegExp(
            `<strong>${escapeRegex(child.title)}</strong>`,
            'g'
        );
        result = result.replace(plainPattern,
            `<a href="${treeHref}" class="sub-anchor-link ${breadthClass}" title="${attrTitle}">${child.title}</a>`
        );

        // Upgrade pass: narratives stored before this change contain links pointing at
        // /narrative/<id>. Rewrite their opening tag to the tree href and ensure the title,
        // so existing narratives get the new behaviour at read time without regeneration.
        const oldLinkPattern = new RegExp(
            `<a href="/narrative/${escapeRegex(child.id)}\\?breadth=[ABC]" class="(sub-anchor-link[^"]*)"[^>]*>`,
            'g'
        );
        result = result.replace(oldLinkPattern, (_, cls) =>
            `<a href="${treeHref}" class="${cls}" title="${attrTitle}">`
        );
    }
    return result;
}

export { linkChildAnchors };
