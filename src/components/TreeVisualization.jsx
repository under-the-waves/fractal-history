import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    getBreadthColor,
    treeStructure,
    getChildren as getStaticChildren,
    getAnchorById as getStaticAnchorById
} from '../data/treeStructure';
import WhyTheseAnchors from './WhyTheseAnchors';

function TreeVisualization() {
    const navigate = useNavigate();
    const [activePath, setActivePath] = useState([]);
    const [breadthSelections, setBreadthSelections] = useState({});
    const containerRef = useRef(null);

    const [treeData, setTreeData] = useState({});
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [loadingBreadth, setLoadingBreadth] = useState(null); // { nodeId, breadth } when loading

    // State for "Why these Anchors?" sidebar
    const [sidebarData, setSidebarData] = useState(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // State for collapsible legend
    const [legendExpanded, setLegendExpanded] = useState(false);

    // Error state for user-facing messages
    const [errorMessage, setErrorMessage] = useState(null);

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

        return nodes;
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

    if (loading) {
        return (
            <div className="tree-visualization">
                <h1>Fractal History Tree</h1>
                <p>Loading tree data...</p>
            </div>
        );
    }

    // Overlay for generating new anchors (longer process)
    const generatingOverlay = generating ? (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
        }}>
            <div style={{
                backgroundColor: 'white',
                padding: '30px',
                borderRadius: '8px',
                textAlign: 'center'
            }}>
                <h2>Generating Anchors...</h2>
                <p>This may take 10-20 seconds. Please wait.</p>
                <div style={{
                    marginTop: '20px',
                    fontSize: '24px'
                }}>⏳</div>
            </div>
        </div>
    ) : null;

    // Overlay for loading existing anchors
    const loadingOverlay = loadingBreadth ? (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9998
        }}>
            <div style={{
                backgroundColor: 'white',
                padding: '20px 30px',
                borderRadius: '8px',
                textAlign: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}>
                <div style={{
                    fontSize: '18px',
                    fontWeight: '600',
                    color: '#333',
                    marginBottom: '8px'
                }}>Loading...</div>
                <div style={{
                    fontSize: '14px',
                    color: '#666'
                }}>Please wait 5-10 seconds</div>
            </div>
        </div>
    ) : null;

    const visibleNodes = getVisibleNodes();

    return (
        <div className="tree-visualization">
            {generatingOverlay}
            {loadingOverlay}

            {/* Error banner */}
            {errorMessage && (
                <div className="tree-error-banner" onClick={() => setErrorMessage(null)}>
                    {errorMessage}
                </div>
            )}

            {/* Frozen header */}
            <div className="tree-header">
                <h1>Fractal History Tree</h1>
                <span className="tree-subtitle">Click to expand. Toggle A/B for different perspectives.</span>

                {/* Collapsible legend */}
                <div className="breadth-legend">
                    <button
                        className="legend-toggle"
                        onClick={() => setLegendExpanded(!legendExpanded)}
                    >
                        Breadth: <span style={{ color: '#3498db' }}>A</span>=Analytical <span style={{ color: '#27ae60' }}>B</span>=Temporal {legendExpanded ? '▲' : '▼'}
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
                        </div>
                    )}
                </div>
            </div>

            <div
                className="tree-container"
                ref={containerRef}
                style={{
                    height: 'calc(100vh - 140px)',
                    overflowY: 'auto',
                    overflowX: 'auto'
                }}
            >
                <svg width={svgWidth} height={svgHeight} style={{ overflow: 'visible' }}>

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
                                                {['A', 'B'].map((breadth, index) => {
                                                    const activeBreadth = getActiveBreadth(node.id);
                                                    const isActive = breadth === activeBreadth;
                                                    // Check both local treeData and static data
                                                    const hasChildrenAtBreadth = getChildren(node.id, breadth).length > 0 ||
                                                        getStaticChildren(node.id, breadth).length > 0;
                                                    const buttonWidth = (nodeWidth / 2 - 15) / 3 - 2;
                                                    const buttonX = 10 + index * (buttonWidth + 2);
                                                    const breadthColor = getBreadthColor(breadth);

                                                    // Only show color if this breadth is active AND node is expanded (in path)
                                                    const shouldShowColor = isActive && isInPath;

                                                    return (
                                                        <g
                                                            key={breadth}
                                                            onClick={async (e) => {
                                                                e.stopPropagation();

                                                                // If we already have children locally, update UI immediately (no loading needed)
                                                                if (hasChildrenAtBreadth) {
                                                                    // Update UI state immediately - no waiting
                                                                    setBreadthSelections(prev => ({ ...prev, [node.id]: breadth }));
                                                                    const nodeIndexInPath = activePath.indexOf(node.id);
                                                                    if (nodeIndexInPath !== -1) {
                                                                        setActivePath(activePath.slice(0, nodeIndexInPath + 1));
                                                                    } else {
                                                                        setActivePath([...activePath, node.id]);
                                                                    }
                                                                    // Fetch metadata in background (don't await, don't show loading)
                                                                    fetchMetadataData(node.id, breadth).then(metadataData => {
                                                                        if (metadataData.success && metadataData.found) {
                                                                            const metadata = metadataData.metadata;
                                                                            setSidebarData({
                                                                                parentId: node.id,
                                                                                parentTitle: metadataData.parentInfo?.title || node.anchor.title || node.id,
                                                                                breadth: metadata.breadth,
                                                                                candidates: metadata.candidates,
                                                                                selectionReasoning: metadata.selection_reasoning,
                                                                                generatedAt: metadata.generated_at
                                                                            });
                                                                        } else {
                                                                            setSidebarData(null);
                                                                        }
                                                                    }).catch(() => setSidebarData(null));
                                                                    return;
                                                                }

                                                                // Show loading only when we need to fetch/generate
                                                                setLoadingBreadth({ nodeId: node.id, breadth });

                                                                try {
                                                                    // Check database for children (A or B breadths only for now)
                                                                    if (breadth === 'A' || breadth === 'B') {
                                                                        const checkResponse = await fetch(`/api/get-tree?parentId=${node.id}&breadth=${breadth}`);
                                                                        const checkData = await checkResponse.json();

                                                                        if (checkData.success && checkData.count > 0) {
                                                                            // Data exists in DB - use coordinated fetch
                                                                            await fetchBreadthData(node.id, node.anchor.title, breadth);
                                                                            return;
                                                                        }

                                                                        // No data - need to generate (switch to generating overlay)
                                                                        setLoadingBreadth(null);
                                                                        setGenerating(true);
                                                                        try {
                                                                            const generateResponse = await fetch('/api/generate-anchors', {
                                                                                method: 'POST',
                                                                                headers: { 'Content-Type': 'application/json' },
                                                                                body: JSON.stringify({
                                                                                    parentId: node.id,
                                                                                    parentTitle: node.anchor.title,
                                                                                    parentScope: node.anchor.scope || '',
                                                                                    breadth: breadth
                                                                                })
                                                                            });

                                                                            const generateData = await generateResponse.json();

                                                                            if (generateData.success) {
                                                                                await fetchBreadthData(node.id, node.anchor.title, breadth);
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
                                                                        return;
                                                                    }

                                                                    // Fallback for any breadth without generation support
                                                                    await fetchBreadthData(node.id, node.anchor.title, breadth);
                                                                } finally {
                                                                    setLoadingBreadth(null);
                                                                }
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