import fs from 'fs';
import path from 'path';
import { analyticalAncestors } from '../shared/ancestry.js';
import { getName } from './geography.js';

/**
 * A temporal (B) node's coordinate: its date range, WITHOUT its topical label.
 *
 * Temporal anchors embed the range in their title — "Colonial Era: 1607 - 1776",
 * "European Expansion (1450–1600)" — so we surface only the range and drop the name,
 * which must never reach the generator as a theme. Falls back to the scope text, then
 * to a neutral placeholder, if no range can be parsed.
 *
 * @param {Object} node - ancestor object with title/scope
 * @returns {string} a "when", e.g. "1607 - 1776"
 */
export function temporalCoordinate(node) {
    const title = (node && node.title) || '';
    const afterColon = title.includes(':') ? title.slice(title.lastIndexOf(':') + 1).trim() : '';
    if (/\d/.test(afterColon)) return afterColon;
    const paren = title.match(/\(([^)]*\d[^)]*)\)/);
    if (paren) return paren[1].trim();
    const span = title.match(/[\d,]+\s*(?:BYA|MYA|KYA|BCE|BC|CE|AD)?\s*[-–—]+\s*(?:[\d,]+\s*(?:BYA|MYA|KYA|BCE|BC|CE|AD)?|present)/i);
    if (span) return span[0].trim();
    return (node && node.scope) || 'time period not specified';
}

/**
 * A geographic (C) node's coordinate: the actual places it covers, from structured
 * region_codes, WITHOUT its prose title. Falls back to the title only if codes are
 * missing (e.g. cosmic regions, which carry no ledger codes).
 *
 * @param {Object} node - ancestor object with region_codes/title
 * @returns {string} a "where", e.g. "Eastern Asia, Southern Asia"
 */
export function geographicCoordinate(node) {
    const codes = node && Array.isArray(node.region_codes) ? node.region_codes : [];
    if (codes.length > 0) {
        const names = codes.map(getName).filter(Boolean);
        if (names.length > 0) return names.join(', ');
    }
    return (node && node.title) || 'region not specified';
}

/**
 * The parent's identity for a prompt heading. For a temporal/geographic parent we show
 * only its coordinate (a when / a where); only analytical or root parents show a title,
 * where the title legitimately is the topic.
 *
 * @param {Array} ancestorPath - root-first ancestor objects (parent is last)
 * @param {string} fallbackTitle - the parent's title, used only for A/root parents
 * @returns {string}
 */
export function renderParentLabel(ancestorPath, fallbackTitle) {
    const parent = Array.isArray(ancestorPath) && ancestorPath.length
        ? ancestorPath[ancestorPath.length - 1] : null;
    if (parent && parent.breadth === 'B') return `[time window] ${temporalCoordinate(parent)}`;
    if (parent && parent.breadth === 'C') return `[region] ${geographicCoordinate(parent)}`;
    return fallbackTitle;
}

/**
 * The subject ONE Learn-pipeline section must cover, for the axis the learner is following.
 *
 * A (analytical): the section IS its theme — its title. B (temporal): the section is a TIME
 * WINDOW — surface only its date range, never its descriptive name. C (geographic): the section
 * is a PLACE — surface only its region. This is the same "B/C titles are coordinates, not themes"
 * rule the anchor generator already uses, applied to study-content generation.
 *
 * @param {'A'|'B'|'C'} breadth - the axis the children sit on
 * @param {Object} child - the child anchor node (title, region_codes, scope)
 * @returns {{axis:'theme'|'when'|'where', coord:string}}
 */
export function learnSectionSubject(breadth, child) {
    if (breadth === 'B') return { axis: 'when', coord: temporalCoordinate(child) };
    if (breadth === 'C') return { axis: 'where', coord: geographicCoordinate(child) };
    return { axis: 'theme', coord: (child && child.title) || '' };
}

/**
 * The coverage rule shared by the research and card stages for a whole anchor's sections. All
 * children share one axis, so the instruction is computed once. For a time window or a place the
 * section's descriptive NAME is a signpost only; the content must cover the whole window / place
 * within the analytical lens, never narrow to whatever theme the name happens to suggest.
 *
 * A `when` (temporal/B) axis is normally WHOLE-WORLD in scope. But when the studied anchor sits
 * under (or is itself) a geographic (C) anchor, that place's region already bounds the whole study —
 * a B-axis study of "Oceania" must stay about Oceania across each time window, not broaden to the
 * whole world. `geoScope` carries that region (from the nearest C ancestor, see buildSectionFrame in
 * lib/learnContent.js); when set, it REPLACES the whole-world instruction with a region-bounded one,
 * mirroring renderParentSignpost's "place, not theme" treatment for the generation pipeline.
 *
 * @param {'theme'|'when'|'where'} axis
 * @param {string} frameText - output of renderAnalyticalFrame for these children
 * @param {string|null} [geoScope] - the bounding region for a 'when' axis, or null/undefined for whole-world
 * @returns {string}
 */
export function learnCoverageInstruction(axis, frameText, geoScope) {
    const lens = `\n\nANALYTICAL LENS for these sections:\n${frameText}`;
    if (axis === 'when' && geoScope) {
        return `Each section is a TIME WINDOW (its dates are shown). Cover the most significant `
            + `developments IN ${geoScope} during that window — its peoples and powers, economy, `
            + 'culture and ideas, and its environment — and its connections outward, including people '
            + `or forces from there acting elsewhere — not one theme. Do NOT broaden to the whole world: `
            + `the region is fixed as ${geoScope}. The section's descriptive name is only a signpost for `
            + 'the period: never let its wording (e.g. "agricultural", "medieval") narrow the content to '
            + 'a single subject.' + lens;
    }
    if (axis === 'when') {
        return 'Each section is a TIME WINDOW (its dates are shown). Cover the most significant '
            + 'developments across the WHOLE WORLD during that window — politics and states, empires '
            + 'and war, economy and trade, religion and ideas, science and technology, art, and everyday '
            + 'life — not one theme. The section\'s descriptive name is only a signpost for the period: '
            + 'never let its wording (e.g. "agricultural", "medieval") narrow the content to a single '
            + 'subject or to one region.' + lens;
    }
    if (axis === 'where') {
        return 'Each section is a PLACE or REGION (shown). Cover everything significant about that place '
            + 'in this topic — its peoples and powers, economy, culture and ideas, and its connections '
            + 'outward — including forces and people from there acting elsewhere, not only events on its '
            + 'soil. The section\'s descriptive name is only a signpost for the place: never let its '
            + 'wording narrow the content to a single theme.' + lens;
    }
    return 'For each section, cover the CORE MEANING of its title — the most foundational facts a '
        + 'learner must know about it. Do not fixate on a narrow detail because the wording happens to '
        + 'emphasise it.';
}

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

    // Temporal (B) and geographic (C) ancestors contribute only coordinates (a when /
    // a where). Their topical titles are hidden so they exert no thematic pull on the
    // children. Analytical (A) and root ancestors keep their titles.
    return ancestorPath.map((a) => {
        if (a.breadth === 'B') {
            return `Level ${a.level}: [temporal scope] When: ${temporalCoordinate(a)}`;
        }
        if (a.breadth === 'C') {
            return `Level ${a.level}: [geographic scope] Where: ${geographicCoordinate(a)}`;
        }
        return `Level ${a.level}: **${a.title}** (${a.breadth || 'Root'})\n   Scope: ${a.scope || 'No scope defined'}`;
    }).join('\n\n');
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

    // Only analytical (A) and root titles are listed. Temporal (B) and geographic (C)
    // titles are deliberately hidden from the generator, so re-listing them here would
    // defeat that — and children of a B/C parent are coordinates/places anyway, not
    // re-statements of the parent's topical name.
    const titles = ancestorPath
        .filter(a => a.breadth === 'A' || a.breadth === null || a.breadth === undefined)
        .map(a => `- "${a.title}"`);
    return titles.length > 0 ? titles.join('\n') : 'None';
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
        return `**The parent is a TIME WINDOW (a *when*), not a theme.** Its only constraint on `
            + `the children is its date range (${temporalCoordinate(parent)}). Within that window, `
            + 'cover everything significant that happened, framed by the analytical lens above. The '
            + 'period has been given to you as dates on purpose: do not infer any theme for it.';
    }
    if (parent.breadth === 'C') {
        return `**The parent is a PLACE (a *where*), not a theme.** Its only constraint on the `
            + `children is its region (${geographicCoordinate(parent)}). Cover this place's full `
            + "CONNECTION to the analytical lens above — its people, forces, money, and decisions "
            + "wherever they acted, not only events that physically happened on its soil (e.g. under "
            + "'World War I', 'Australia' covers the ANZACs at Gallipoli and in France, not just "
            + "fighting on Australian land). The place has been given to you as a region on purpose: "
            + 'do not infer any theme for it.';
    }
    return '';
}
