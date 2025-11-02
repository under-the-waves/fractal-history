import { useState, useEffect, useRef } from 'react';
import { treeStructure, getChildren, getAnchorById } from '../data/treeStructure';

function TreeVisualization() {
    const [activePath, setActivePath] = useState([]); // Tracks hierarchy of expanded nodes
    const containerRef = useRef(null);

    // Layout constants
    const rowHeight = 140;
    const nodeWidth = 200;
    const nodeHeight = 80;
    const horizontalSpacing = 40;
    const containerWidth = 1200;

    // Scroll to center the currently expanded node (last in activePath)
    useEffect(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;

        if (activePath.length === 0) {
            // ROOT at top - scroll to top
            container.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        } else {
            // Center the currently expanded node (last in activePath)
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
        // Just add to the path - show final state immediately
        setActivePath([...activePath, anchorId]);
    };

    const handleCollapse = (anchorId) => {
        // Just update the path - show final state immediately
        const indexInPath = activePath.indexOf(anchorId);
        const newPath = activePath.slice(0, indexInPath);
        setActivePath(newPath);
    };

    // Determine which nodes should be rendered
    const getVisibleNodes = () => {
        const nodes = [];

        if (activePath.length === 0) {
            // Initial state: just ROOT, unexpanded
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

        // Add all ancestors in path (above currently expanded)
        activePath.slice(0, -1).forEach((ancestorId, index) => {
            const ancestor = getAnchorById(ancestorId);
            nodes.push({
                anchor: ancestor,
                id: ancestorId,
                type: 'ancestor',
                depth: index,
                isExpanded: false // regular grey
            });
        });

        // Add currently expanded node (centered, dark grey)
        const expandedAnchor = getAnchorById(currentlyExpanded);
        nodes.push({
            anchor: expandedAnchor,
            id: currentlyExpanded,
            type: 'expanded',
            depth: activePath.length - 1,
            isExpanded: true // dark grey
        });

        // No siblings ever shown - they only appear during animations which we removed

        // Add children of currently expanded node
        const children = getChildren(currentlyExpanded);
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

    // Calculate position for a node based on its depth and type
    const calculatePosition = (node) => {
        const rowY = 60 + node.depth * rowHeight;

        // Ancestors and currently expanded node: always centered
        if (node.type === 'ancestor' || node.type === 'expanded' || node.type === 'root') {
            return {
                x: (containerWidth - nodeWidth) / 2,
                y: rowY
            };
        }

        // Children: spread out horizontally
        const parentId = node.anchor.parentId;
        const siblings = getChildren(parentId);
        const nodeIndex = siblings.findIndex(s => s.id === node.id);
        const totalInRow = siblings.length;
        const rowWidth = totalInRow * nodeWidth + (totalInRow - 1) * horizontalSpacing;
        const rowStartX = (containerWidth - rowWidth) / 2;

        return {
            x: rowStartX + nodeIndex * (nodeWidth + horizontalSpacing),
            y: rowY
        };
    };

    // Calculate opacity for a node
    const calculateOpacity = (node) => {
        // All nodes always visible (no animations)
        return 1;
    };

    // Calculate color for a node
    const calculateColor = (node) => {
        // Only the currently expanded node (last in activePath) is dark grey
        if (node.isExpanded && node.type === 'expanded') {
            return {
                fill: '#555555',
                text: 'white',
                stroke: '#333333'
            };
        }

        // All other nodes are regular grey
        return {
            fill: '#e0e0e0',
            text: 'black',
            stroke: '#999999'
        };
    };

    const svgWidth = 1200;
    const svgHeight = 60 + 8 * rowHeight; // Allow more rows for deeper nesting

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
                Click "Explore" to dive deeper. Click "Collapse" to go back up.
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
                    {visibleNodes.map((node) => {
                        const pos = calculatePosition(node);
                        const opacity = calculateOpacity(node);
                        const colors = calculateColor(node);
                        const hasChildren = getChildren(node.anchor.id).length > 0;
                        const lines = wrapText(node.anchor.title);

                        // Determine button visibility
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
                                    pointerEvents: opacity > 0.1 ? 'all' : 'none'
                                }}
                            >
                                <rect
                                    x={0}
                                    y={0}
                                    width={nodeWidth}
                                    height={nodeHeight}
                                    fill={colors.fill}
                                    stroke={colors.stroke}
                                    strokeWidth="2"
                                    rx="8"
                                    style={{
                                        transition: 'fill 0.15s ease, stroke 0.15s ease'
                                    }}
                                />

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

                                <g>
                                    {/* Left button: Explore or Collapse */}
                                    {(showExploreButton || showCollapseButton) && (
                                        <g
                                            onClick={() => showExploreButton ? handleExplore(node.id) : handleCollapse(node.id)}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <rect
                                                x={10}
                                                y={nodeHeight - 28}
                                                width={nodeWidth / 2 - 15}
                                                height={22}
                                                fill={colors.fill === '#555555' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}
                                                stroke={colors.fill === '#555555' ? 'white' : '#666'}
                                                strokeWidth="1"
                                                rx="4"
                                            />
                                            <text
                                                x={nodeWidth / 4 + 5}
                                                y={nodeHeight - 13}
                                                textAnchor="middle"
                                                fill={colors.text}
                                                fontSize="10"
                                                fontWeight="bold"
                                            >
                                                {showExploreButton ? 'Explore ▼' : 'Collapse ▲'}
                                            </text>
                                        </g>
                                    )}

                                    {/* Right button: Read (always visible) */}
                                    <g onClick={() => console.log('Read:', node.anchor.id)} style={{ cursor: 'pointer' }}>
                                        <rect
                                            x={nodeWidth / 2 + 5}
                                            y={nodeHeight - 28}
                                            width={nodeWidth / 2 - 15}
                                            height={22}
                                            fill={colors.fill === '#555555' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}
                                            stroke={colors.fill === '#555555' ? 'white' : '#666'}
                                            strokeWidth="1"
                                            rx="4"
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