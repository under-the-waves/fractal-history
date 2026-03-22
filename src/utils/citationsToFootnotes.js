/**
 * Convert inline citation <a> tags to superscript numbered references,
 * leaving sub-anchor-link tags untouched.
 *
 * @param {string} html - Narrative HTML with inline citation links
 * @returns {{ html: string, footnotes: Array<{ number: number, url: string, text: string }> }}
 */
export function citationsToFootnotes(html) {
    if (!html) return { html: '', footnotes: [] };

    const footnotes = [];
    let count = 0;

    // Match <a> tags that do NOT have class="...sub-anchor-link..."
    const processed = html.replace(
        /<a\s+(?![^>]*class="[^"]*sub-anchor-link)[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/g,
        (_match, url, text) => {
            count++;
            footnotes.push({ number: count, url, text });
            return `${text}<sup><a href="${url}" target="_blank" rel="noopener" class="footnote-ref">${count}</a></sup>`;
        }
    );

    return { html: processed, footnotes };
}
