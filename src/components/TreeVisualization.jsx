import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    getBreadthColor,
    treeStructure,
    getChildren as getStaticChildren,
    getAnchorById as getStaticAnchorById
} from '../data/treeStructure';
import WhyTheseAnchors from './WhyTheseAnchors';
import OrientationPanel from './OrientationPanel';
import { getRandomFact } from '../data/historyFacts';

function useIsMobile(breakpoint = 768) {
    const [isMobile, setIsMobile] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia(`(max-width: ${breakpoint}px)`).matches;
    });
    useEffect(() => {
        const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
        const handler = (e) => setIsMobile(e.matches);
        mql.addEventListener('change', handler);
        return () => mql.removeEventListener('change', handler);
    }, [breakpoint]);
    return isMobile;
}

function TreeVisualization() {
    const isMobile = useIsMobile();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [activePath, setActivePath] = useState([]);
    const [breadthSelections, setBreadthSelections] = useState({});
    const containerRef = useRef(null);

    const [treeData, setTreeData] = useState({});
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [loadingBreadth, setLoadingBreadth] = useState(null); // { nodeId, breadth } when loading

    // Single continuous "busy" overlay (covers both the DB check and generation).
    // overlayMounted keeps it in the DOM through its fade-out; overlayVisible drives
    // the opacity transition. overlayFact is the history fact shown while waiting.
    const [overlayMounted, setOverlayMounted] = useState(false);
    const [overlayVisible, setOverlayVisible] = useState(false);
    const [overlayFact, setOverlayFact] = useState(() => getRandomFact());

    // State for "Why these Anchors?" sidebar
    const [sidebarData, setSidebarData] = useState(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // State for collapsible legend
    const [legendExpanded, setLegendExpanded] = useState(false);

    // Error state for user-facing messages
    const [errorMessage, setErrorMessage] = useState(null);

    // First-visit welcome overlay (dismissable, persisted in localStorage)
    const [showIntro, setShowIntro] = useState(() => {
        if (typeof window === 'undefined') return false;
        try { return localStorage.getItem('fh-intro-dismissed') !== '1'; }
        catch { return false; }
    });
    const dismissIntro = () => {
        try { localStorage.setItem('fh-intro-dismissed', '1'); } catch { /* ignore */ }
        setShowIntro(false);
    };

    // Helper functions to work with treeData
    const getChildren = (parentId, breadth = 'A') => {
        return Object.values(treeData).filter(anchor =>
            anchor.parentId === parentId && anchor.breadth === breadth
        ).sort((a, b) => a.position - b.position);
    };

    const getAnchorById = (id) => {
        return treeData[id];
    };

    const getAvailableBreadthLevels = (parentId) => {
        const children = Object.values(treeData).filter(anchor => anchor.parentId === parentId);
        const breadthLevels = [...new Set(children.map(child => child.breadth))];
        return breadthLevels.sort();
    };

    // Fetch children from database - returns data without setting state
    const fetchChildrenData = async (parentId, breadth = 'A') => {
        try {
            const response = await fetch(`/api/get-tree?parentId=${parentId}&breadth=${breadth}`);
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching children:', error);
            return { success: false, anchors: [] };
        }
    };

    // Fetch generation metadata - returns data without setting state
    const fetchMetadataData = async (parentId, breadth) => {
        try {
            const response = await fetch(`/api/get-generation-metadata?parentId=${parentId}&breadth=${breadth}`);
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching generation metadata:', error);
            return { success: false, found: false };
        }
    };

    // Coordinated fetch: get both children and metadata in parallel, update state once
    // Note: Caller should set loadingBreadth before calling and clear it after
    const fetchBreadthData = async (nodeId, nodeTitle, breadth) => {
        // Check if children already exist in local treeData (from static data or previous fetches)
        const localChildren = getChildren(nodeId, breadth);
        const hasLocalChildren = localChildren.length > 0;

        // Also check static data directly
        const staticChildren = getStaticChildren(nodeId, breadth);
        const hasStaticChildren = staticChildren.length > 0;

        let childrenData = { success: true, anchors: [] };
        let metadataData = { success: false, found: false };

        if (hasLocalChildren || hasStaticChildren) {
            // Children exist locally - no need to fetch from API
            // Just fetch metadata (which may or may not exist for static anchors)
            childrenData = {
                success: true,
                anchors: localChildren.length > 0 ? localChildren : staticChildren
            };
            // Optionally fetch metadata in background (non-blocking for static data)
            try {
                metadataData = await fetchMetadataData(nodeId, breadth);
            } catch {
                // Metadata fetch failed - that's ok for static anchors
                metadataData = { success: false, found: false };
            }
        } else {
            // No local children - need to fetch from API
            const [fetchedChildren, fetchedMetadata] = await Promise.all([
                fetchChildrenData(nodeId, breadth),
                fetchMetadataData(nodeId, breadth)
            ]);
            childrenData = fetchedChildren;
            metadataData = fetchedMetadata;

            // Process children data from API
            if (childrenData.success && childrenData.anchors.length > 0) {
                const newTreeData = { ...treeData };
                childrenData.anchors.forEach(anchor => {
                    newTreeData[anchor.id] = {
                        id: anchor.id,
                        title: anchor.title,
                        scope: anchor.scope,
                        level: anchor.level,
                        breadth: anchor.breadth,
                        position: anchor.position,
                        parentId: nodeId
                    };
                });
                setTreeData(newTreeData);
            }
        }

        // Process metadata
        if (metadataData.success && metadataData.found) {
            const metadata = metadataData.metadata;
            setSidebarData({
                parentId: nodeId,
                parentTitle: metadataData.parentInfo?.title || nodeTitle || nodeId,
                breadth: metadata.breadth,
                candidates: metadata.candidates,
                selectionReasoning: metadata.selection_reasoning,
                generatedAt: metadata.generated_at
            });
        } else {
            setSidebarData(null);
        }

        // Update breadth selection
        setBreadthSelections(prev => ({ ...prev, [nodeId]: breadth }));

        // Update active path
        const nodeIndexInPath = activePath.indexOf(nodeId);
        if (nodeIndexInPath !== -1) {
            setActivePath(activePath.slice(0, nodeIndexInPath + 1));
        } else {
            setActivePath([...activePath, nodeId]);
        }

        return { hasChildren: childrenData.anchors?.length > 0, childrenData };
    };

    // Legacy function for backwards compatibility
    const fetchGenerationMetadata = async (parentId, breadth) => {
        const data = await fetchMetadataData(parentId, breadth);
        if (data.success && data.found) {
            const metadata = data.metadata;
            setSidebarData({
                parentId: parentId,
                parentTitle: data.parentInfo?.title || parentId,
                breadth: metadata.breadth,
                candidates: metadata.candidates,
                selectionReasoning: metadata.selection_reasoning,
                generatedAt: metadata.generated_at
            });
        } else {
            setSidebarData(null);
        }
    };

    // Layout constants
    const rowHeight = 160;
    const nodeWidth = 200;
    const nodeHeight = 100;
    const horizontalSpacing = 40;
    const containerWidth = 1200;

    // Load static tree data on mount (instant - no API call needed)
    useEffect(() => {
        // Convert static treeStructure array to treeData object format
        const staticTreeData = {};
        treeStructure.forEach(anchor => {
            staticTreeData[anchor.id] = {
                id: anchor.id,
                title: anchor.title,
                scope: anchor.scope || '',
                level: anchor.level,
                breadth: anchor.breadth,
                position: anchor.position,
                parentId: anchor.parentId
            };
        });
        setTreeData(staticTreeData);
        setLoading(false);
    }, []);

    // Scroll to center the currently expanded node
    useEffect(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;

        if (activePath.length === 0) {
            container.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        } else {
            const depth = activePath.length - 1;
            const nodeY = 60 + depth * rowHeight;
            const containerHeight = container.clientHeight;
            const scrollTop = nodeY - containerHeight / 2 + nodeHeight / 2;
            container.scrollTo({
                top: scrollTop,
                behavior: 'smooth'
            });
        }
    }, [activePath]);

    // Initial scroll on mount
    useEffect(() => {
        if (!containerRef.current) return;
        containerRef.current.scrollTo({
            top: 0,
            behavior: 'auto'
        });
    }, []);

    const handleExplore = async (anchorId) => {
        const breadth = breadthSelections[anchorId] || 'A';
        // Check both local treeData and static data for children
        const existingChildren = getChildren(anchorId, breadth);
        const staticChildrenList = getStaticChildren(anchorId, breadth);
        const hasChildren = existingChildren.length > 0 || staticChildrenList.length > 0;
        const anchor = getAnchorById(anchorId) || getStaticAnchorById(anchorId);

        // If we already have children locally or in static data, update UI immediately (no loading)
        if (hasChildren) {
            setActivePath([...activePath, anchorId]);
            if (!breadthSelections[anchorId]) {
                setBreadthSelections({ ...breadthSelections, [anchorId]: 'A' });
            }
            // Fetch metadata in background (don't block UI)
            fetchGenerationMetadata(anchorId, breadth);
            return;
        }

        // Only show loading when we need to fetch/generate
        setLoadingBreadth({ nodeId: anchorId, breadth });
        try {
            // Use coordinated fetch for children + metadata
            await fetchBreadthData(anchorId, anchor?.title, breadth);
        } finally {
            setLoadingBreadth(null);
        }
    };

    const handleCollapse = (anchorId) => {
        const indexInPath = activePath.indexOf(anchorId);
        const newPath = activePath.slice(0, indexInPath);
        setActivePath(newPath);
    };

    const handleBreadthToggle = (anchorId, newBreadth) => {
        setBreadthSelections({
            ...breadthSelections,
            [anchorId]: newBreadth
        });
    };

    const getActiveBreadth = (nodeId) => {
        return breadthSelections[nodeId] || 'A';
    };

    // Select a breadth on an anchor: instant update if children exist locally,
    // otherwise fetch from DB or generate via API. Used by both desktop SVG
    // breadth buttons and the mobile card layout.
    const handleBreadthSelect = async (anchor, breadth) => {
        const nodeId = anchor.id;
        const anchorTitle = anchor.title;
        const anchorScope = anchor.scope || '';

        const hasChildrenAtBreadth = getChildren(nodeId, breadth).length > 0 ||
            getStaticChildren(nodeId, breadth).length > 0;

        const applyMetadata = (metadataData) => {
            if (metadataData?.success && metadataData.found) {
                const metadata = metadataData.metadata;
                setSidebarData({
                    parentId: nodeId,
                    parentTitle: metadataData.parentInfo?.title || anchorTitle || nodeId,
                    breadth: metadata.breadth,
                    candidates: metadata.candidates,
                    selectionReasoning: metadata.selection_reasoning,
                    generatedAt: metadata.generated_at
                });
            } else {
                setSidebarData(null);
            }
        };

        if (hasChildrenAtBreadth) {
            setBreadthSelections(prev => ({ ...prev, [nodeId]: breadth }));
            const nodeIndexInPath = activePath.indexOf(nodeId);
            if (nodeIndexInPath !== -1) {
                setActivePath(activePath.slice(0, nodeIndexInPath + 1));
            } else {
                setActivePath([...activePath, nodeId]);
            }
            fetchMetadataData(nodeId, breadth).then(applyMetadata).catch(() => setSidebarData(null));
            return;
        }

        setLoadingBreadth({ nodeId, breadth });
        try {
            const checkResponse = await fetch(`/api/get-tree?parentId=${nodeId}&breadth=${breadth}`);
            const checkData = await checkResponse.json();

            if (checkData.success && checkData.count > 0) {
                await fetchBreadthData(nodeId, anchorTitle, breadth);
                return;
            }

            // Keep loadingBreadth set so the overlay stays mounted continuously –
            // generating only changes the copy inside the same overlay, never swaps it.
            setGenerating(true);
            try {
                const generateResponse = await fetch('/api/generate-anchors', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        parentId: nodeId,
                        parentTitle: anchorTitle,
                        parentScope: anchorScope,
                        breadth: breadth
                    })
                });

                const generateData = await generateResponse.json();

                if (generateData.success) {
                    await fetchBreadthData(nodeId, anchorTitle, breadth);
                } else {
                    console.error(`Failed to generate ${breadth}-anchors:`, generateData.error);
                    setErrorMessage(`Failed to generate ${breadth}-anchors: ${generateData.error}`);
                    setTimeout(() => setErrorMessage(null), 5000);
                }
            } catch (error) {
                console.error(`Error generating ${breadth}-anchors:`, error);
                setErrorMessage(`Error generating ${breadth}-anchors. Please try again.`);
                setTimeout(() => setErrorMessage(null), 5000);
            } finally {
                setGenerating(false);
            }
        } finally {
            setLoadingBreadth(null);
        }
    };

    // Expand the tree straight to a node, given the full chain of ids from root to it.
    // Used by deep links from narratives (breadcrumbs and sub-anchor links). An anchor's
    // breadth is NOT reliably encoded in its id (a temporal B-child can have a "5A-" id),
    // so we discover each node's real breadth by loading its parent's children across all
    // breadths and reading the breadth the data reports.
    const openPath = async (ids) => {
        if (!ids || ids.length === 0) return;
        setLoading(true);
        try {
            const additions = {};
            const breadthSel = {};

            const known = (id) => treeData[id] || additions[id] || getStaticAnchorById(id) || null;

            const haveChildren = (parent, b) =>
                getStaticChildren(parent, b).length > 0 ||
                Object.values(treeData).some(a => a.parentId === parent && a.breadth === b) ||
                Object.values(additions).some(a => a.parentId === parent && a.breadth === b);

            // Load a parent's children across every breadth we don't already hold.
            const loadAllBreadths = async (parent) => {
                const missing = ['A', 'B', 'C'].filter(b => !haveChildren(parent, b));
                const datas = await Promise.all(missing.map(b => fetchChildrenData(parent, b)));
                datas.forEach(data => {
                    if (data && data.success && Array.isArray(data.anchors)) {
                        data.anchors.forEach(a => {
                            additions[a.id] = {
                                id: a.id, title: a.title, scope: a.scope, level: a.level,
                                breadth: a.breadth, position: a.position, parentId: parent
                            };
                        });
                    }
                });
            };

            const breadthWithChildren = (parent) =>
                ['A', 'B', 'C'].find(b =>
                    getStaticChildren(parent, b).length > 0 ||
                    Object.values(treeData).some(a => a.parentId === parent && a.breadth === b) ||
                    Object.values(additions).some(a => a.parentId === parent && a.breadth === b)
                );

            // Walk each edge: ensure the next node is loaded, then record the breadth it
            // actually sits under so that level renders with the right children.
            for (let k = 0; k < ids.length - 1; k++) {
                const parent = ids[k];
                const next = ids[k + 1];
                if (!known(next)) await loadAllBreadths(parent);
                const node = known(next);
                breadthSel[parent] = (node && node.breadth) || breadthWithChildren(parent) || 'A';
            }

            // Load the target's children so its sub-anchors show on arrival, defaulting to
            // a breadth that actually has children.
            const target = ids[ids.length - 1];
            await loadAllBreadths(target);
            breadthSel[target] = breadthWithChildren(target) || 'A';

            if (Object.keys(additions).length > 0) {
                setTreeData(prev => ({ ...prev, ...additions }));
            }
            setBreadthSelections(prev => ({ ...prev, ...breadthSel }));
            setActivePath(ids);
        } catch (err) {
            console.error('Failed to open tree path:', err);
        } finally {
            setLoading(false);
        }
    };

    // Deep-link: when the URL carries ?path=id0,id1,...,target, expand to that node.
    const openedPathRef = useRef(null);
    useEffect(() => {
        const pathParam = searchParams.get('path');
        if (!pathParam) return;
        if (openedPathRef.current === pathParam) return;
        openedPathRef.current = pathParam;
        const ids = pathParam.split(',').map(s => s.trim()).filter(Boolean);
        if (ids.length > 0) openPath(ids);
    }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

    // Navigate the mobile breadcrumb: make the tapped ancestor the currently
    // expanded node (slice keeps that ancestor in the path).
    const navigateToAncestor = (anchorId) => {
        const indexInPath = activePath.indexOf(anchorId);
        if (indexInPath === -1) return;
        setActivePath(activePath.slice(0, indexInPath + 1));
        const breadth = getActiveBreadth(anchorId);
        fetchMetadataData(anchorId, breadth).then(metadataData => {
            if (metadataData?.success && metadataData.found) {
                const metadata = metadataData.metadata;
                const anchor = getAnchorById(anchorId);
                setSidebarData({
                    parentId: anchorId,
                    parentTitle: metadataData.parentInfo?.title || anchor?.title || anchorId,
                    breadth: metadata.breadth,
                    candidates: metadata.candidates,
                    selectionReasoning: metadata.selection_reasoning,
                    generatedAt: metadata.generated_at
                });
            } else {
                setSidebarData(null);
            }
        }).catch(() => setSidebarData(null));
    };

    // Determine which nodes should be rendered
    const getVisibleNodes = () => {
        const nodes = [];

        if (activePath.length === 0) {
            const root = getAnchorById('0-ROOT');
            nodes.push({
                anchor: root,
                id: root.id,
                type: 'root',
                depth: 0,
                isExpanded: false
            });
            return nodes;
        }

        const currentlyExpanded = activePath[activePath.length - 1];

        // Add all ancestors in path
        activePath.slice(0, -1).forEach((ancestorId, index) => {
            const ancestor = getAnchorById(ancestorId);
            nodes.push({
                anchor: ancestor,
                id: ancestorId,
                type: 'ancestor',
                depth: index,
                isExpanded: false
            });
        });

        // Add currently expanded node
        const expandedAnchor = getAnchorById(currentlyExpanded);
        nodes.push({
            anchor: expandedAnchor,
            id: currentlyExpanded,
            type: 'expanded',
            depth: activePath.length - 1,
            isExpanded: true
        });

        // Add children using active breadth selection
        const activeBreadth = getActiveBreadth(currentlyExpanded);
        const children = getChildren(currentlyExpanded, activeBreadth);
        children.forEach(child => {
            nodes.push({
                anchor: child,
                id: child.id,
                type: 'child',
                depth: activePath.length,
                isExpanded: false
            });
        });

        // Safety net: never render a node whose anchor failed to load, so a missing
        // deep-link target degrades gracefully instead of white-screening the tree.
        return nodes.filter(n => n.anchor);
    };


    const calculatePosition = (node) => {
        const rowY = 60 + node.depth * rowHeight;

        if (node.type === 'ancestor' || node.type === 'expanded' || node.type === 'root') {
            return {
                x: (containerWidth - nodeWidth) / 2,
                y: rowY
            };
        }

        const parentId = node.anchor.parentId;
        const activeBreadth = getActiveBreadth(parentId);
        const siblings = getChildren(parentId, activeBreadth);
        const nodeIndex = siblings.findIndex(s => s.id === node.id);
        const totalInRow = siblings.length;
        const rowWidth = totalInRow * nodeWidth + (totalInRow - 1) * horizontalSpacing;
        const rowStartX = (containerWidth - rowWidth) / 2;

        return {
            x: rowStartX + nodeIndex * (nodeWidth + horizontalSpacing),
            y: rowY
        };
    };

    const calculateOpacity = (node) => {
        return 1;
    };

    const calculateColor = (node) => {
        // For ROOT that hasn't been clicked, use grey accent
        if (node.type === 'root' && activePath.length === 0) {
            return {
                fill: '#e0e0e0',
                text: 'black',
                stroke: '#999999',
                accentColor: '#999999'  // Grey accent until clicked
            };
        }

        // For children, use parent's active breadth to determine accent color
        let accentColor;
        if (node.anchor.parentId) {
            const parentBreadth = getActiveBreadth(node.anchor.parentId);
            accentColor = getBreadthColor(parentBreadth);
        } else {
            // For ROOT when it's been clicked
            const activeBreadth = getActiveBreadth(node.id);
            accentColor = getBreadthColor(activeBreadth);
        }

        if (node.isExpanded && node.type === 'expanded') {
            return {
                fill: '#555555',
                text: 'white',
                stroke: '#333333',
                accentColor: accentColor
            };
        }

        return {
            fill: '#e0e0e0',
            text: 'black',
            stroke: '#999999',
            accentColor: accentColor
        };
    };

    const svgWidth = 1200;
    const svgHeight = 60 + 8 * rowHeight;

    const wrapText = (text, maxChars = 22) => {
        const words = text.split(' ');
        const lines = [];
        let current = '';
        words.forEach(word => {
            if ((current + ' ' + word).trim().length <= maxChars) {
                current = (current + ' ' + word).trim();
            } else {
                if (current) lines.push(current);
                current = word;
            }
        });
        if (current) lines.push(current);
        return lines;
    };

    // We're waiting whenever we're checking the DB or generating new anchors.
    const busy = !!loadingBreadth || generating;

    // Mount/unmount the overlay with a fade. On busy: mount, then (next tick) fade in.
    // On idle: fade out, then unmount once the transition has finished.
    useEffect(() => {
        if (busy) {
            setOverlayMounted(true);
            const id = setTimeout(() => setOverlayVisible(true), 20);
            return () => clearTimeout(id);
        }
        setOverlayVisible(false);
        const id = setTimeout(() => setOverlayMounted(false), 250);
        return () => clearTimeout(id);
    }, [busy]);

    // Pick a fresh fact when a wait begins, and rotate every 8s through long waits.
    // The same fact stays put across the DB-check → generation transition (no yank),
    // and rotations avoid repeating the fact just shown.
    useEffect(() => {
        if (!busy) return;
        const nextFact = (prev) => {
            let f = getRandomFact();
            if (f === prev) f = getRandomFact();
            return f;
        };
        setOverlayFact(nextFact);
        const id = setInterval(() => setOverlayFact(nextFact), 8000);
        return () => clearInterval(id);
    }, [busy]);

    if (loading) {
        return (
            <div className="tree-visualization">
                <h1>Fractal History Tree</h1>
                <p>Loading tree data...</p>
            </div>
        );
    }

    // One continuous overlay for the whole wait. The DB check and generation share it;
    // only the sub-line copy changes when we cross into generation. It fades in/out and
    // the history fact cross-fades as it rotates.
    const busyOverlay = overlayMounted ? (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            opacity: overlayVisible ? 1 : 0,
            transition: 'opacity 0.25s ease'
        }}>
            <div style={{
                backgroundColor: 'white',
                padding: '30px',
                borderRadius: '8px',
                textAlign: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                maxWidth: '440px'
            }}>
                <h2 style={{ margin: '0 0 8px' }}>Exploring…</h2>
                <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
                    {generating
                        ? 'Composing new anchors – this can take 10-20 seconds…'
                        : 'Fetching from the archive…'}
                </p>
                <div style={{
                    marginTop: '20px',
                    fontSize: '24px'
                }}>⏳</div>
                <div
                    key={overlayFact}
                    className="overlay-fact-text"
                    style={{
                        marginTop: '20px',
                        maxWidth: '380px',
                        marginLeft: 'auto',
                        marginRight: 'auto',
                        fontSize: '14px',
                        color: '#555',
                        lineHeight: 1.5,
                        textAlign: 'left',
                        borderLeft: '3px solid #2c3e50',
                        paddingLeft: '12px'
                    }}>
                    <strong style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#2c3e50', marginBottom: '4px' }}>Did you know?</strong>
                    {overlayFact}
                </div>
            </div>
        </div>
    ) : null;

    const introOverlay = showIntro ? (
        <div className="intro-overlay" role="dialog" aria-modal="true" aria-label="Welcome">
            <div className="intro-card">
                <h2>Welcome to Fractal History</h2>
                <p className="intro-tagline">
                    A first-principles map of world history – from the Big Bang to the present.
                </p>
                <ul className="intro-steps">
                    <li><strong>Tap any topic</strong> to see its sub-topics.</li>
                    <li><strong>A / B / C</strong> switch between analytical, temporal, and geographic views.</li>
                    <li><strong>Read</strong> opens the narrative for the current topic.</li>
                </ul>
                <button className="intro-btn" onClick={dismissIntro} autoFocus>Start exploring →</button>
            </div>
        </div>
    ) : null;

    const visibleNodes = getVisibleNodes();

    if (isMobile) {
        const expandedNode = visibleNodes.find(n => n.type === 'expanded') || visibleNodes.find(n => n.type === 'root');
        const expandedAnchor = expandedNode?.anchor;
        const ancestors = visibleNodes.filter(n => n.type === 'ancestor');
        const childNodes = visibleNodes.filter(n => n.type === 'child');
        const activeBreadth = expandedAnchor ? getActiveBreadth(expandedAnchor.id) : 'A';
        const accentColor = expandedAnchor && expandedAnchor.id !== '0-ROOT' && expandedAnchor.parentId
            ? getBreadthColor(getActiveBreadth(expandedAnchor.parentId))
            : getBreadthColor(activeBreadth);
        const childrenAccent = getBreadthColor(activeBreadth);
        const showStart = activePath.length === 0;

        return (
            <div className="tree-visualization mobile-tree-wrapper">
                {introOverlay}
                {busyOverlay}

                {errorMessage && (
                    <div className="tree-error-banner" onClick={() => setErrorMessage(null)}>
                        {errorMessage}
                    </div>
                )}

                <div className="mobile-tree">
                    <header className="mobile-tree-header">
                        <h1>Fractal History</h1>
                        <button
                            className="mobile-legend-toggle"
                            onClick={() => setLegendExpanded(!legendExpanded)}
                            aria-expanded={legendExpanded}
                        >
                            <span style={{ color: '#3498db' }}>A</span>
                            <span style={{ color: '#27ae60' }}>B</span>
                            <span style={{ color: '#e67e22' }}>C</span>
                            <span className="mobile-legend-caret">{legendExpanded ? '▲' : '▼'}</span>
                        </button>
                    </header>

                    {legendExpanded && (
                        <div className="mobile-legend-panel">
                            <div className="legend-item">
                                <span className="legend-color" style={{ backgroundColor: '#3498db' }}></span>
                                <span><strong>A — Analytical:</strong> most essential aspects/themes</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-color" style={{ backgroundColor: '#27ae60' }}></span>
                                <span><strong>B — Temporal:</strong> complete time coverage</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-color" style={{ backgroundColor: '#e67e22' }}></span>
                                <span><strong>C — Geographic:</strong> regional coverage</span>
                            </div>
                        </div>
                    )}

                    {activePath.length > 0 && (
                        <nav className="mobile-tree-breadcrumbs" aria-label="Path">
                            <button
                                className="mobile-breadcrumb-btn mobile-breadcrumb-home"
                                onClick={() => {
                                    setActivePath([]);
                                    setSidebarData(null);
                                }}
                            >
                                ← Top
                            </button>
                            {ancestors.map(ancestor => (
                                <span key={ancestor.id} className="mobile-breadcrumb-segment">
                                    <span className="mobile-breadcrumb-sep">›</span>
                                    <button
                                        className="mobile-breadcrumb-btn"
                                        onClick={() => navigateToAncestor(ancestor.id)}
                                    >
                                        {ancestor.anchor.title}
                                    </button>
                                </span>
                            ))}
                        </nav>
                    )}

                    {activePath.length > 0 && (
                        <OrientationPanel
                            chain={activePath.map(id => getAnchorById(id)).filter(Boolean)}
                            currentId={activePath[activePath.length - 1]}
                            onNavigate={navigateToAncestor}
                        />
                    )}

                    {expandedAnchor && (
                        <section
                            className={showStart ? 'mobile-tree-current mobile-tree-current-root' : 'mobile-tree-current'}
                            style={{ borderTopColor: accentColor }}
                        >
                            <h2 className="mobile-tree-title">{expandedAnchor.title}</h2>
                            {expandedAnchor.scope && (
                                <p className="mobile-tree-scope">{expandedAnchor.scope}</p>
                            )}

                            {showStart ? (
                                <button
                                    className="mobile-primary-btn"
                                    onClick={() => handleExplore(expandedAnchor.id)}
                                >
                                    Start exploring →
                                </button>
                            ) : (
                                <>
                                    <div className="mobile-breadth-row" role="group" aria-label="Choose breadth">
                                        <span className="mobile-breadth-label">Breadth</span>
                                        <div className="mobile-breadth-btns">
                                            {['A', 'B', 'C'].map(b => {
                                                const isActive = b === activeBreadth;
                                                const color = getBreadthColor(b);
                                                return (
                                                    <button
                                                        key={b}
                                                        className={`mobile-breadth-btn${isActive ? ' active' : ''}`}
                                                        onClick={() => handleBreadthSelect(expandedAnchor, b)}
                                                        style={isActive ? { background: color, borderColor: color, color: 'white' } : undefined}
                                                        aria-pressed={isActive}
                                                    >
                                                        {b}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <button
                                        className="mobile-primary-btn"
                                        onClick={() => navigate(`/narrative/${expandedAnchor.id}?breadth=${activeBreadth}`)}
                                    >
                                        Read this article →
                                    </button>

                                    {sidebarData && (
                                        <button
                                            className="mobile-why-btn"
                                            onClick={() => setSidebarOpen(true)}
                                            style={{ color: getBreadthColor(sidebarData.breadth) }}
                                        >
                                            Why these sub-topics? →
                                        </button>
                                    )}
                                </>
                            )}
                        </section>
                    )}

                    {!showStart && childNodes.length > 0 && (
                        <>
                            <h3 className="mobile-children-label">Sub-topics</h3>
                            <ul className="mobile-children">
                                {childNodes.map(child => (
                                    <li key={child.id} className="mobile-child-card">
                                        <button
                                            className="mobile-child-main"
                                            onClick={() => handleExplore(child.anchor.id)}
                                        >
                                            <span
                                                className="mobile-child-accent"
                                                style={{ background: childrenAccent }}
                                                aria-hidden="true"
                                            ></span>
                                            <span className="mobile-child-body">
                                                <span className="mobile-child-title">{child.anchor.title}</span>
                                                {child.anchor.scope && (
                                                    <span className="mobile-child-scope">{child.anchor.scope}</span>
                                                )}
                                            </span>
                                            <span className="mobile-child-chevron" aria-hidden="true">›</span>
                                        </button>
                                        <button
                                            className="mobile-child-read"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(`/narrative/${child.anchor.id}?breadth=${getActiveBreadth(child.anchor.id)}`);
                                            }}
                                            aria-label={`Read ${child.anchor.title}`}
                                        >
                                            Read →
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>

                <WhyTheseAnchors
                    data={sidebarData}
                    isOpen={sidebarOpen}
                    onToggle={setSidebarOpen}
                />
            </div>
        );
    }

    return (
        <div className="tree-visualization">
            {introOverlay}
            {busyOverlay}

            {/* Error banner */}
            {errorMessage && (
                <div className="tree-error-banner" onClick={() => setErrorMessage(null)}>
                    {errorMessage}
                </div>
            )}

            {/* Frozen header */}
            <div className="tree-header">
                <h1>Fractal History Tree</h1>
                <span className="tree-subtitle">Click to expand. Toggle A/B/C for different perspectives.</span>

                {/* Collapsible legend */}
                <div className="breadth-legend">
                    <button
                        className="legend-toggle"
                        onClick={() => setLegendExpanded(!legendExpanded)}
                    >
                        Breadth: <span style={{ color: '#3498db' }}>A</span>=Analytical <span style={{ color: '#27ae60' }}>B</span>=Temporal <span style={{ color: '#e67e22' }}>C</span>=Geographic {legendExpanded ? '▲' : '▼'}
                    </button>
                    {legendExpanded && (
                        <div className="legend-expanded">
                            <div className="legend-item">
                                <span className="legend-color" style={{ backgroundColor: '#3498db' }}></span>
                                <span><strong>Breadth A:</strong> Analytical anchors - most essential aspects/themes</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-color" style={{ backgroundColor: '#27ae60' }}></span>
                                <span><strong>Breadth B:</strong> Temporal anchors - complete time coverage</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-color" style={{ backgroundColor: '#e67e22' }}></span>
                                <span><strong>Breadth C:</strong> Geographic anchors - regional coverage</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {activePath.length > 0 && (
                <OrientationPanel
                    chain={activePath.map(id => getAnchorById(id)).filter(Boolean)}
                    currentId={activePath[activePath.length - 1]}
                    onNavigate={navigateToAncestor}
                />
            )}

            <div
                className="tree-container"
                ref={containerRef}
                style={{
                    height: 'calc(100vh - 140px)',
                    overflowY: 'auto',
                    overflowX: 'auto'
                }}
            >
                <svg
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    width="100%"
                    preserveAspectRatio="xMidYMin meet"
                    style={{ overflow: 'visible', maxWidth: svgWidth, height: 'auto', display: 'block' }}
                >

                    {visibleNodes.map((node) => {
                        const pos = calculatePosition(node);
                        const opacity = calculateOpacity(node);
                        const colors = calculateColor(node);
                        const hasChildren = getChildren(node.anchor.id, 'A').length > 0;
                        const lines = wrapText(node.anchor.title);

                        const isInPath = activePath.includes(node.id);

                        return (
                            <g
                                key={node.id}
                                data-testid={`tree-node-${node.anchor.id}`}
                                style={{
                                    transform: `translate(${pos.x}px, ${pos.y}px)`,
                                    transition: 'transform 0.4s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.2s ease',
                                    opacity: opacity,
                                    pointerEvents: opacity > 0.1 ? 'all' : 'none',
                                    cursor: (node.type === 'root' && activePath.length === 0) ? 'pointer' : 'default'
                                }}
                                onClick={() => {
                                    if (node.type === 'root' && activePath.length === 0) {
                                        handleExplore(node.id);
                                    }
                                }}
                            >
                                {/* Top accent bar */}
                                <rect
                                    x={0}
                                    y={0}
                                    width={nodeWidth}
                                    height={6}
                                    fill={colors.accentColor}
                                />

                                {/* Main node rectangle */}
                                <rect
                                    x={0}
                                    y={6}
                                    width={nodeWidth}
                                    height={nodeHeight - 6}
                                    fill={colors.fill}
                                    stroke={colors.stroke}
                                    strokeWidth="2"
                                    style={{
                                        transition: 'fill 0.15s ease, stroke 0.15s ease'
                                    }}
                                />

                                {/* Title text */}
                                <text
                                    x={nodeWidth / 2}
                                    y={22}
                                    textAnchor="middle"
                                    fill={colors.text}
                                    fontSize="12"
                                    fontWeight={colors.fill === '#555555' ? 'bold' : 'normal'}
                                    style={{ transition: 'fill 0.15s ease' }}
                                >
                                    {lines.map((line, i) => (
                                        <tspan key={i} x={nodeWidth / 2} dy={i === 0 ? 0 : '1.1em'}>
                                            {line}
                                        </tspan>
                                    ))}
                                </text>

                                {/* Action buttons */}
                                <g>
                                    {/* Show buttons on all nodes except unclicked ROOT */}
                                    {(node.type !== 'root' || activePath.length > 0) && (
                                        <>
                                            {/* Always show breadth toggle buttons (A, B, C) */}
                                            <g>
                                                {/* "Breadth" label */}
                                                <text
                                                    x={nodeWidth / 4 + 5}
                                                    y={nodeHeight - 34}
                                                    textAnchor="middle"
                                                    fill={colors.text}
                                                    fontSize="10"
                                                    fontWeight="bold"
                                                >
                                                    Breadth
                                                </text>

                                                {/* Breadth buttons */}
                                                {['A', 'B', 'C'].map((breadth, index) => {
                                                    const activeBreadth = getActiveBreadth(node.id);
                                                    const isActive = breadth === activeBreadth;
                                                    const buttonWidth = (nodeWidth / 2 - 15) / 3 - 2;
                                                    const buttonX = 10 + index * (buttonWidth + 2);
                                                    const breadthColor = getBreadthColor(breadth);

                                                    // Only show color if this breadth is active AND node is expanded (in path)
                                                    const shouldShowColor = isActive && isInPath;

                                                    return (
                                                        <g
                                                            key={breadth}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleBreadthSelect(node.anchor, breadth);
                                                            }}
                                                        >
                                                            <rect
                                                                x={buttonX}
                                                                y={nodeHeight - 22}
                                                                width={buttonWidth}
                                                                height={16}
                                                                fill={shouldShowColor ? breadthColor : '#e8e8e8'}
                                                                stroke={shouldShowColor ? breadthColor : '#555'}
                                                                strokeWidth="1"
                                                                opacity={1}
                                                                rx="2"
                                                                style={{
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.2s ease'
                                                                }}
                                                            />
                                                            <text
                                                                x={buttonX + buttonWidth / 2}
                                                                y={nodeHeight - 22 + 12}
                                                                textAnchor="middle"
                                                                fill={shouldShowColor ? 'white' : '#333'}
                                                                fontSize="11"
                                                                fontWeight="600"
                                                                pointerEvents="none"
                                                            >
                                                                {breadth}
                                                            </text>
                                                        </g>
                                                    );
                                                })}
                                            </g>

                                            {/* Right button: Read */}
                                            <g onClick={() => navigate(`/narrative/${node.anchor.id}?breadth=${getActiveBreadth(node.id)}`)} style={{ cursor: 'pointer' }}>
                                                <rect
                                                    x={nodeWidth / 2 + 5}
                                                    y={nodeHeight - 28}
                                                    width={nodeWidth / 2 - 15}
                                                    height={22}
                                                    fill={colors.fill === '#555555' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}
                                                    stroke={colors.fill === '#555555' ? 'white' : '#666'}
                                                    strokeWidth="1"
                                                />
                                                <text
                                                    x={3 * nodeWidth / 4}
                                                    y={nodeHeight - 13}
                                                    textAnchor="middle"
                                                    fill={colors.text}
                                                    fontSize="10"
                                                    fontWeight="bold"
                                                >
                                                    Read →
                                                </text>
                                            </g>
                                        </>
                                    )}
                                </g>
                            </g>
                        );
                    })}

                    {/* "Why these Anchors?" button - positioned above children row */}
                    {activePath.length > 0 && sidebarData && (
                        <foreignObject
                            x={svgWidth - 180}
                            y={60 + activePath.length * rowHeight - 35}
                            width={160}
                            height={30}
                        >
                            <button
                                onClick={() => setSidebarOpen(true)}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    background: getBreadthColor(sidebarData.breadth),
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                }}
                            >
                                <span>Why these Anchors?</span>
                                <span>◀</span>
                            </button>
                        </foreignObject>
                    )}
                </svg>

                {/* "Why these Anchors?" Slide-in Panel */}
                <WhyTheseAnchors
                    data={sidebarData}
                    isOpen={sidebarOpen}
                    onToggle={setSidebarOpen}
                />
            </div>
        </div >
    );
}

export default TreeVisualization;