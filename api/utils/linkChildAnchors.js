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
function linkChildAnchors(html, children, breadth) {
    if (!html || !children || children.length === 0) return html;

    const breadthClass = breadth === 'B' ? 'sub-anchor-link-temporal' : 'sub-anchor-link-analytical';

    let result = html;
    for (const child of children) {
        // The exact sub-anchor title, shown as a hover tooltip so readers can see what
        // a prose phrase actually links to (e.g. "the late republic" -> "Late Republic: ...").
        const attrTitle = escapeAttr(child.title);

        // Pattern 1: <strong data-title='Exact Title'>display text</strong>
        // Quote char is captured (group 1) and backreferenced (\1) so the opening and
        // closing quotes must match. Accepts both ' and " for backward compatibility.
        const dataPattern = new RegExp(
            `<strong\\s+data-title=(["'])${escapeRegex(child.title)}\\1>(.*?)</strong>`,
            'g'
        );
        result = result.replace(dataPattern, (_, _quote, displayText) =>
            `<a href="/narrative/${child.id}?breadth=A" class="sub-anchor-link ${breadthClass}" title="${attrTitle}">${displayText}</a>`
        );

        // Pattern 2: <strong>Exact Title</strong> (fallback for A/C or older narratives)
        const plainPattern = new RegExp(
            `<strong>${escapeRegex(child.title)}</strong>`,
            'g'
        );
        const link = `<a href="/narrative/${child.id}?breadth=A" class="sub-anchor-link ${breadthClass}" title="${attrTitle}">${child.title}</a>`;
        result = result.replace(plainPattern, link);

        // Upgrade pass: narratives stored before hover labels existed already contain
        // <a ... class="sub-anchor-link ..."> for this child but no title attribute. The
        // negative lookahead skips links that already have a title (e.g. ones just created
        // above), so this only backfills the missing ones — no regeneration needed.
        const untitledLinkPattern = new RegExp(
            `<a href="/narrative/${escapeRegex(child.id)}\\?breadth=A" class="(sub-anchor-link[^"]*)"(?![^>]*\\btitle=)`,
            'g'
        );
        result = result.replace(untitledLinkPattern, (_, cls) =>
            `<a href="/narrative/${child.id}?breadth=A" class="${cls}" title="${attrTitle}"`
        );
    }
    return result;
}

export { linkChildAnchors };
