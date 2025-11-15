import { useState, useEffect, useRef } from 'react';
import { getBreadthColor } from '../data/treeStructure';

function TreeVisualization() {
    const [activePath, setActivePath] = useState([]);
    const [breadthSelections, setBreadthSelections] = useState({});
    const containerRef = useRef(null);

    const [treeData, setTreeData] = useState({});
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);

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

    // Fetch children from database
    const fetchChildren = async (parentId, breadth = 'A') => {
        try {
            const response = await fetch(`/api/get-tree?parentId=${parentId}&breadth=${breadth}`);
            const data = await response.json();

            if (data.success && data.anchors.length > 0) {
                const newTreeData = { ...treeData };
                data.anchors.forEach(anchor => {
                    newTreeData[anchor.id] = {
                        id: anchor.id,
                        title: anchor.title,
                        scope: anchor.scope,
                        level: anchor.level,
                        breadth: anchor.breadth,
                        position: anchor.position,
                        parentId: parentId
                    };
                });
                setTreeData(newTreeData);
            }
        } catch (error) {
            console.error('Error fetching children:', error);
        }
    };


    // Layout constants
    const rowHeight = 160;
    const nodeWidth = 200;
    const nodeHeight = 100;
    const horizontalSpacing = 40;
    const containerWidth = 1200;

    // Load ROOT node from database on mount
    useEffect(() => {
        const fetchRoot = async () => {
            try {
                const response = await fetch('/api/get-tree');
                const data = await response.json();

                if (data.success && data.anchors.length > 0) {
                    const root = data.anchors[0];
                    setTreeData({
                        [root.id]: {
                            id: root.id,
                            title: root.title,
                            scope: root.scope,
                            level: root.level || 0,
                            breadth: root.breadth,
                            position: root.position || 1,
                            parentId: null
                        }
                    });
                }
                setLoading(false);
            } catch (error) {
                console.error('Error fetching root:', error);
                setLoading(false);
            }
        };
        fetchRoot();
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
        setActivePath([...activePath, anchorId]);
        if (!breadthSelections[anchorId]) {
            setBreadthSelections({ ...breadthSelections, [anchorId]: 'A' });
        }

        // Fetch children if we don't have them yet
        const breadth = breadthSelections[anchorId] || 'A';
        const existingChildren = getChildren(anchorId, breadth);
        if (existingChildren.length === 0) {
            await fetchChildren(anchorId, breadth);
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

    // Add this overlay for generating
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

    const visibleNodes = getVisibleNodes();

    return (
        <div className="tree-visualization">
            {generatingOverlay}
            <h1>Fractal History Tree</h1>
            <p className="tree-description">
                Click "Expand" to dive deeper. Toggle breadth (A/B/C) to see different organizational perspectives.
            </p>

            <div
                className="tree-container"
                ref={containerRef}
                style={{
                    height: '600px',
                    overflowY: 'auto',
                    overflowX: 'hidden'
                }}
            >
                <svg width={svgWidth} height={svgHeight} style={{ overflow: 'visible' }}>
                    {/* Legend in top left corner */}
                    <g className="legend">
                        <rect
                            x={10}
                            y={10}
                            width={300}
                            height={100}
                            fill="white"
                            stroke="#999"
                            strokeWidth="2"
                        />
                        <text x={25} y={38} fontSize="14" fontWeight="bold" fill="#333">
                            Breadth Legend
                        </text>
                        <rect x={25} y={48} width={18} height={18} fill="#3498db" />
                        <text x={50} y={62} fontSize="13" fill="#555">
                            Breadth A: Analytical anchors
                        </text>
                        <rect x={25} y={70} width={18} height={18} fill="#27ae60" />
                        <text x={50} y={84} fontSize="13" fill="#555">
                            Breadth B: Temporal anchors
                        </text>
                        <rect x={25} y={92} width={18} height={18} fill="#e67e22" />
                        <text x={50} y={106} fontSize="13" fill="#555">
                            Breadth C: Geographic anchors
                        </text>
                    </g>

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

                                                {/* Breadth buttons - always show A, B, C */}
                                                {['A', 'B', 'C'].map((breadth, index) => {
                                                    const activeBreadth = getActiveBreadth(node.id);
                                                    const isActive = breadth === activeBreadth;
                                                    const hasChildrenAtBreadth = getChildren(node.id, breadth).length > 0;
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

                                                                // Special handling for breadth A (may need generation)
                                                                // But never generate for ROOT - it has hardcoded children
                                                                if (breadth === 'A' && !hasChildrenAtBreadth && node.id !== '0-ROOT') {
                                                                    // Check database first
                                                                    const response = await fetch(`/api/get-tree?parentId=${node.id}&breadth=A`);
                                                                    const data = await response.json();

                                                                    // If database has children, load them directly (no second fetch)
                                                                    if (data.success && data.count > 0) {
                                                                        const newTreeData = { ...treeData };
                                                                        data.anchors.forEach(anchor => {
                                                                            newTreeData[anchor.id] = {
                                                                                id: anchor.id,
                                                                                title: anchor.title,
                                                                                scope: anchor.scope,
                                                                                level: anchor.level,
                                                                                breadth: anchor.breadth,
                                                                                position: anchor.position,
                                                                                parentId: node.id
                                                                            };
                                                                        });
                                                                        setTreeData(newTreeData);
                                                                    } else {
                                                                        // No children in database - generate them
                                                                        setGenerating(true);
                                                                        try {
                                                                            const genResponse = await fetch('/api/generate-anchors', {
                                                                                method: 'POST',
                                                                                headers: { 'Content-Type': 'application/json' },
                                                                                body: JSON.stringify({
                                                                                    parentId: node.id,
                                                                                    parentTitle: node.anchor.title,
                                                                                    parentScope: node.anchor.scope || 'No scope available',
                                                                                    breadth: 'A'
                                                                                })
                                                                            });
                                                                            const genData = await genResponse.json();

                                                                            if (genData.success) {
                                                                                await fetchChildren(node.id, 'A');
                                                                                setGenerating(false);
                                                                            } else {
                                                                                alert('Failed to generate anchors: ' + genData.error);
                                                                                setGenerating(false);
                                                                                return;
                                                                            }
                                                                        } catch (error) {
                                                                            alert('Error generating anchors.');
                                                                            setGenerating(false);
                                                                            return;
                                                                        }
                                                                    }
                                                                }

                                                                // For all breadths: switch to this breadth and collapse to this node
                                                                handleBreadthToggle(node.id, breadth);

                                                                // Collapse to this node (removes all descendants)
                                                                const nodeIndexInPath = activePath.indexOf(node.id);
                                                                if (nodeIndexInPath !== -1) {
                                                                    const newPath = activePath.slice(0, nodeIndexInPath + 1);
                                                                    setActivePath(newPath);
                                                                } else {
                                                                    // If not in path, expand it
                                                                    handleExplore(node.id);
                                                                }
                                                            }
                                                            }
                                                        >
                                                            <rect
                                                                x={buttonX}
                                                                y={nodeHeight - 22}
                                                                width={buttonWidth}
                                                                height={16}
                                                                fill={shouldShowColor ? breadthColor : (colors.fill === '#555555' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)')}
                                                                stroke={shouldShowColor ? breadthColor : (colors.fill === '#555555' ? 'rgba(255,255,255,0.3)' : '#999')}
                                                                strokeWidth="1"
                                                                opacity={(hasChildrenAtBreadth || breadth === 'A') ? 1 : 0.3}
                                                                style={{ cursor: 'pointer' }}
                                                            />
                                                            <text
                                                                x={buttonX + buttonWidth / 2}
                                                                y={nodeHeight - 10}
                                                                textAnchor="middle"
                                                                fill={shouldShowColor ? 'white' : colors.text}
                                                                fontSize="10"
                                                                fontWeight={shouldShowColor ? "bold" : "normal"}
                                                                opacity={hasChildrenAtBreadth ? 1 : 0.3}
                                                            >
                                                                {breadth}
                                                            </text>
                                                        </g>
                                                    );
                                                })}
                                            </g>

                                            {/* Right button: Read */}
                                            <g onClick={() => console.log('Read:', node.anchor.id)} style={{ cursor: 'pointer' }}>
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
                </svg>
            </div>
        </div >
    );
}

export default TreeVisualization;