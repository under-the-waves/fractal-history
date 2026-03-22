/**
 * Post-process narrative HTML to convert <strong>Title</strong> tags
 * for child anchors into styled navigational links.
 */

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace <strong>ChildTitle</strong> with a styled link to that child's narrative.
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
        const pattern = new RegExp(
            `<strong>${escapeRegex(child.title)}</strong>`,
            'g'
        );
        const link = `<a href="/narrative/${child.id}?breadth=A" class="sub-anchor-link ${breadthClass}">${child.title}</a>`;
        result = result.replace(pattern, link);
    }
    return result;
}

export { linkChildAnchors };
