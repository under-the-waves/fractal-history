import { useState, useEffect, useRef } from 'react';
import { treeStructure, getChildren, getAnchorById, getAvailableBreadthLevels, getBreadthColor } from '../data/treeStructure';

function TreeVisualization() {
    const [activePath, setActivePath] = useState([]);
    const [breadthSelections, setBreadthSelections] = useState({});
    const containerRef = useRef(null);

    // Layout constants
    const rowHeight = 160;
    const nodeWidth = 200;
    const nodeHeight = 100;
    const horizontalSpacing = 40;
    const containerWidth = 1200;

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

    const handleExplore = (anchorId) => {
        setActivePath([...activePath, anchorId]);
        if (!breadthSelections[anchorId]) {
            setBreadthSelections({ ...breadthSelections, [anchorId]: 'A' });
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

    const visibleNodes = getVisibleNodes();

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



    return (
        <div className="tree-visualization">
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
                        const showExploreButton = !isInPath && hasChildren && opacity > 0;
                        const showCollapseButton = isInPath;

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
                                    {/* Only show buttons if ROOT is clicked (in path) OR if it's not ROOT */}
                                    {(node.type !== 'root' || activePath.length > 0) && (
                                        <>
                                            {/* Left button area - show breadth toggle if multiple breadth levels */}
                                            {hasChildren && (() => {
                                                const availableBreadth = getAvailableBreadthLevels(node.id);
                                                if (availableBreadth.length > 1) {
                                                    // Show breadth toggle for all nodes with multiple breadth
                                                    const activeBreadth = getActiveBreadth(node.id);
                                                    const primaryBreadth = availableBreadth.slice(0, 3);

                                                    return (
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
                                                            {primaryBreadth.map((breadth, index) => {
                                                                const isActive = breadth === activeBreadth;
                                                                const buttonWidth = (nodeWidth / 2 - 15) / primaryBreadth.length - 2;
                                                                const buttonX = 10 + index * (buttonWidth + 2);
                                                                const breadthColor = getBreadthColor(breadth);

                                                                return (
                                                                    <g
                                                                        key={breadth}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleBreadthToggle(node.id, breadth);

                                                                            // If this node is in the path but not the last (i.e., it's a grandparent or ancestor)
                                                                            // collapse everything below it
                                                                            const nodeIndexInPath = activePath.indexOf(node.id);
                                                                            if (nodeIndexInPath !== -1 && nodeIndexInPath < activePath.length - 1) {
                                                                                // Collapse to this node
                                                                                const newPath = activePath.slice(0, nodeIndexInPath + 1);
                                                                                setActivePath(newPath);
                                                                            } else if (!isInPath) {
                                                                                // If not in path at all, expand it
                                                                                handleExplore(node.id);
                                                                            }
                                                                        }}
                                                                        style={{ cursor: 'pointer' }}
                                                                    >
                                                                        <rect
                                                                            x={buttonX}
                                                                            y={nodeHeight - 22}
                                                                            width={buttonWidth}
                                                                            height={16}
                                                                            fill={isActive ? breadthColor : (colors.fill === '#555555' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)')}
                                                                            stroke={isActive ? breadthColor : (colors.fill === '#555555' ? 'rgba(255,255,255,0.3)' : '#999')}
                                                                            strokeWidth="1"
                                                                        />
                                                                        <text
                                                                            x={buttonX + buttonWidth / 2}
                                                                            y={nodeHeight - 10}
                                                                            textAnchor="middle"
                                                                            fill={isActive ? 'white' : colors.text}
                                                                            fontSize="10"
                                                                            fontWeight={isActive ? "bold" : "normal"}
                                                                        >
                                                                            {breadth}
                                                                        </text>
                                                                    </g>
                                                                );
                                                            })}
                                                        </g>
                                                    );
                                                }
                                                return null;
                                            })()}

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
        </div>
    );
}

export default TreeVisualization;