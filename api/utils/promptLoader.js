import fs from 'fs';
import path from 'path';
import { analyticalAncestors } from '../../shared/ancestry.js';

/**
 * Load a prompt template from a .md file and interpolate variables.
 *
 * @param {string} filename - The prompt file name (e.g., 'breadth-a-selection.md')
 * @param {Object} variables - Key-value pairs to interpolate (e.g., { parentId: '0-ROOT', parentTitle: 'History' })
 * @returns {string} The populated prompt template
 *
 * @example
 * const prompt = loadPrompt('breadth-a-selection.md', {
 *   parentId: '0-ROOT',
 *   parentTitle: 'The Story of Everything',
 *   parentScope: 'All of history',
 *   ancestorContext: '...',
 *   siblingContext: '...'
 * });
 */
export function loadPrompt(filename, variables = {}) {
    // Resolve path relative to project root
    const promptPath = path.join(process.cwd(), 'api', 'prompts', filename);

    let template;
    try {
        template = fs.readFileSync(promptPath, 'utf-8');
    } catch (error) {
        console.error(`Error loading prompt template: ${promptPath}`, error);
        throw new Error(`Failed to load prompt template: ${filename}`);
    }

    // Interpolate variables using {{variableName}} syntax
    const populated = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        if (key in variables) {
            return variables[key];
        }
        console.warn(`Warning: Template variable '${key}' not provided for ${filename}`);
        return match; // Leave unmatched variables as-is
    });

    return populated;
}

/**
 * Format ancestor path for display in prompts.
 *
 * @param {Array} ancestorPath - Array of ancestor objects with id, title, scope, level, breadth
 * @returns {string} Formatted ancestor context string
 */
export function formatAncestorContext(ancestorPath) {
    if (!ancestorPath || ancestorPath.length === 0) {
        return 'No ancestor path (this is a top-level anchor)';
    }

    return ancestorPath.map((a, i) =>
        `Level ${a.level}: **${a.title}** (${a.breadth || 'Root'})\n   Scope: ${a.scope || 'No scope defined'}`
    ).join('\n\n');
}

/**
 * Format sibling anchors for display in prompts.
 *
 * @param {Array} siblings - Array of sibling anchor objects with id, title, scope
 * @returns {string} Formatted sibling context string
 */
export function formatSiblingContext(siblings) {
    if (!siblings || siblings.length === 0) {
        return 'None yet - you are generating the first children';
    }

    return siblings.map((s, i) =>
        `${i + 1}. ${s.title}\n   Scope: ${s.scope || 'No scope'}`
    ).join('\n\n');
}

/**
 * Extract ancestor titles as a list for anti-circularity checks.
 *
 * @param {Array} ancestorPath - Array of ancestor objects
 * @returns {string} Bullet list of forbidden titles
 */
export function formatForbiddenTitles(ancestorPath) {
    if (!ancestorPath || ancestorPath.length === 0) {
        return 'None';
    }

    return ancestorPath.map(a => `- "${a.title}"`).join('\n');
}

/**
 * Render the analytical frame for child generation.
 *
 * Analytical (thematic) framing is inherited ONLY from A-ancestors. Temporal (B)
 * and geographic (C) ancestors — including an immediate B/C parent — contribute
 * coordinates (when/where), never a theme. The nearest A-ancestor is the primary
 * lens; any broader A-ancestors are context. When there is no A-ancestor at all,
 * the children must not be narrowed to any theme.
 *
 * @param {Array} ancestorPath - root-first ancestor objects (parent is last)
 * @returns {string} Frame text for the prompt
 */
export function renderAnalyticalFrame(ancestorPath) {
    const aAncestors = analyticalAncestors(ancestorPath);
    if (aAncestors.length === 0) {
        return 'None. There is no analytical (thematic) ancestor, so do NOT narrow the '
            + 'children to any single theme — cover everything significant within the '
            + 'coordinates below.';
    }
    const nearest = aAncestors[aAncestors.length - 1];
    let text = `**${nearest.title}** — ${nearest.scope || 'No scope defined'}\n`
        + 'This is the lens for what the children are ABOUT.';
    if (aAncestors.length > 1) {
        const broader = aAncestors.slice(0, -1).map(a => a.title).join(' → ');
        text += `\nBroader framing (context only): ${broader}.`;
    }
    return text;
}

/**
 * Render the "parent is a signpost, not a theme" instruction.
 *
 * When the immediate parent is temporal (B) or geographic (C), its descriptive
 * title is a coordinate (a when or a where), not a subject. Its wording must not
 * restrict what the children may cover. Returns '' for an analytical (A) or root
 * parent, where the title legitimately is the topic.
 *
 * @param {Array} ancestorPath - root-first ancestor objects (parent is last)
 * @returns {string} Signpost instruction, or '' when not applicable
 */
export function renderParentSignpost(ancestorPath) {
    if (!Array.isArray(ancestorPath) || ancestorPath.length === 0) return '';
    const parent = ancestorPath[ancestorPath.length - 1];
    if (!parent) return '';
    if (parent.breadth === 'B') {
        return `**Read the parent as a signpost, not a theme.** "${parent.title}" names a `
            + 'TIME WINDOW (a *when*), not a subject. Its wording does not restrict what the '
            + 'children may cover. Use only its date range as bounds, and cover everything '
            + 'significant that happened within that window, framed by the analytical lens above.';
    }
    if (parent.breadth === 'C') {
        return `**Read the parent as a signpost, not a theme.** "${parent.title}" names a `
            + "PLACE (a *where*), not a subject. Its wording does not restrict what the children "
            + "may cover. Cover this place's full CONNECTION to the analytical lens above — its "
            + "people, forces, money, and decisions wherever they acted, not only events that "
            + "physically happened on its soil (e.g. under 'World War I', 'Australia' covers the "
            + "ANZACs at Gallipoli and in France, not just fighting on Australian land).";
    }
    return '';
}
