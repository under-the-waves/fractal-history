/**
 * Post-process narrative HTML to convert child anchor markers
 * into styled navigational links.
 *
 * Supports two patterns:
 * 1. <strong>Exact Title</strong>  (A/C breadths where titles read naturally in prose)
 * 2. <strong data-title="Exact Title">prose-friendly text</strong>  (B breadth where
 *    full titles like "Early Modern: 1500 - 1900 CE" don't read well inline)
 */

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
        // Pattern 1: <strong data-title="Exact Title">display text</strong>
        const dataPattern = new RegExp(
            `<strong\\s+data-title="${escapeRegex(child.title)}">(.*?)</strong>`,
            'g'
        );
        result = result.replace(dataPattern, (_, displayText) =>
            `<a href="/narrative/${child.id}?breadth=A" class="sub-anchor-link ${breadthClass}">${displayText}</a>`
        );

        // Pattern 2: <strong>Exact Title</strong> (fallback for A/C or older narratives)
        const plainPattern = new RegExp(
            `<strong>${escapeRegex(child.title)}</strong>`,
            'g'
        );
        const link = `<a href="/narrative/${child.id}?breadth=A" class="sub-anchor-link ${breadthClass}">${child.title}</a>`;
        result = result.replace(plainPattern, link);
    }
    return result;
}

export { linkChildAnchors };
