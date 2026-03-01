import fs from 'fs';
import path from 'path';

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
