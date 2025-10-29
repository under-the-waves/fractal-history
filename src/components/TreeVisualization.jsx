import { useState, useEffect, useRef } from 'react';
import { treeStructure, getChildren, getAnchorById } from '../data/treeStructure';

function TreeVisualization() {
    const [focusedAnchorId, setFocusedAnchorId] = useState(null);
    const [isAnimating, setIsAnimating] = useState(false);
    const containerRef = useRef(null);
    const [focusedNodeY, setFocusedNodeY] = useState(null);

    // Scroll to center focused node when it changes
    useEffect(() => {
        if (focusedNodeY !== null && containerRef.current) {
            const container = containerRef.current;
            const containerHeight = container.clientHeight;
            const scrollTop = focusedNodeY - containerHeight / 2 + 40;

            container.scrollTo({
                top: scrollTop,
                behavior: 'smooth'
            });
        }
    }, [focusedNodeY]);

    const handleExplore = (anchorId) => {
        if (isAnimating) return;

        setIsAnimating(true);
        setFocusedAnchorId(anchorId);

        // Wait for animation to complete before showing children
        setTimeout(() => {
            setIsAnimating(false);
            // Calculate scroll position
            setTimeout(() => {
                const nodes = getDisplayNodes();
                const focusedNode = nodes.find(n => n.isFocused);
                if (focusedNode) {
                    const pos = positionNode(focusedNode);
                    setFocusedNodeY(pos.y);
                }
            }, 50);
        }, 550); // Slightly longer than animation
    };

    const handleCollapse = (anchorId) => {
        if (isAnimating) return;

        setIsAnimating(true);

        if (anchorId === '0-ROOT') {
            setFocusedAnchorId(null);
            setFocusedNodeY(null);
            setTimeout(() => setIsAnimating(false), 550);
        } else {
            const current = getAnchorById(anchorId);
            if (current.parentId) {
                setFocusedAnchorId(current.parentId);
                setTimeout(() => {
                    setIsAnimating(false);
                    setTimeout(() => {
                        const nodes = getDisplayNodes();
                        const focusedNode = nodes.find(n => n.isFocused);
                        if (focusedNode) {
                            const pos = positionNode(focusedNode);
                            setFocusedNodeY(pos.y);
                        }
                    }, 50);
                }, 550);
            }
        }
    };

    const handleReadNarrative = (anchorId) => {
        console.log('Reading narrative:', anchorId);
        // Will implement navigation later
    };

    // Get nodes to display
    const getDisplayNodes = () => {
        const nodes = [];
        const root = getAnchorById('0-ROOT');

        // ROOT always visible in row 0
        const isRootFocused = focusedAnchorId === '0-ROOT' || focusedAnchorId === null;
        nodes.push({
            anchor: root,
            row: 0,
            col: 0,
            totalInRow: 1,
            isFocused: isRootFocused && focusedAnchorId !== null,
            isRoot: true
        });

        // If nothing expanded or still animating, stop here
        if (focusedAnchorId === null || isAnimating) {
            return nodes;
        }

        // If ROOT is focused, show its children
        if (focusedAnchorId === '0-ROOT') {
            const rootChildren = getChildren('0-ROOT');
            rootChildren.forEach((child, idx) => {
                nodes.push({
                    anchor: child,
                    row: 1,
                    col: idx,
                    totalInRow: rootChildren.length,
                    isFocused: false,
                    isRoot: false
                });
            });
            return nodes;
        }

        // Otherwise, focused node is not ROOT
        const focused = getAnchorById(focusedAnchorId);
        const focusedChildren = getChildren(focusedAnchorId);

        // Focused node in row 1 (centered)
        nodes.push({
            anchor: focused,
            row: 1,
            col: 0,
            totalInRow: 1,
            isFocused: true,
            isRoot: false
        });

        // Focused node's children in row 2
        focusedChildren.forEach((child, idx) => {
            nodes.push({
                anchor: child,
                row: 2,
                col: idx,
                totalInRow: focusedChildren.length,
                isFocused: false,
                isRoot: false
            });
        });

        return nodes;
    };

    const displayNodes = getDisplayNodes();

    // Layout constants
    const nodeWidth = 200;
    const nodeHeight = 80;
    const rowHeight = 140;
    const horizontalSpacing = 40;

    // Calculate position for a node
    const positionNode = (node) => {
        const containerWidth = 1200;

        if (node.totalInRow === 1) {
            return {
                x: (containerWidth - nodeWidth) / 2,
                y: 60 + node.row * rowHeight
            };
        } else {
            const rowWidth = node.totalInRow * nodeWidth + (node.totalInRow - 1) * horizontalSpacing;
            const rowStartX = (containerWidth - rowWidth) / 2;
            return {
                x: rowStartX + node.col * (nodeWidth + horizontalSpacing),
                y: 60 + node.row * rowHeight
            };
        }
    };

    // Calculate SVG dimensions
    const maxRow = displayNodes.length > 0 ? Math.max(...displayNodes.map(n => n.row)) : 0;
    const svgWidth = 1200;
    const svgHeight = 60 + (maxRow + 1) * rowHeight + 60;

    // Wrap text
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
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    maxHeight: '600px',
                    position: 'relative'
                }}
            >
                <svg width={svgWidth} height={svgHeight}>
                    <style>
                        {`
                            .tree-node {
                                transition: transform 0.5s ease-out, opacity 0.5s ease-out;
                            }
                            .tree-node rect {
                                transition: fill 0.5s ease-out, stroke 0.5s ease-out;
                            }
                            .tree-node text {
                                transition: fill 0.5s ease-out;
                            }
                        `}
                    </style>
                    {displayNodes.map(node => {
                        const pos = positionNode(node);
                        const hasChildren = getChildren(node.anchor.id).length > 0;
                        const lines = wrapText(node.anchor.title);

                        // Determine what left button should show
                        let showLeftButton = false;
                        let leftButtonText = '';
                        let leftButtonAction = null;

                        if (node.isRoot) {
                            showLeftButton = true;
                            if (focusedAnchorId === null) {
                                leftButtonText = 'Explore ▼';
                                leftButtonAction = () => handleExplore('0-ROOT');
                            } else {
                                leftButtonText = 'Collapse ▲';
                                leftButtonAction = () => handleCollapse('0-ROOT');
                            }
                        } else if (node.isFocused) {
                            showLeftButton = true;
                            leftButtonText = 'Collapse ▲';
                            leftButtonAction = () => handleCollapse(node.anchor.id);
                        } else if (hasChildren) {
                            showLeftButton = true;
                            leftButtonText = 'Explore ▼';
                            leftButtonAction = () => handleExplore(node.anchor.id);
                        }

                        // Styling
                        const fillColor = node.isFocused ? '#555555' : '#e0e0e0';
                        const textColor = node.isFocused ? 'white' : 'black';
                        const strokeColor = node.isFocused ? '#333333' : '#999999';

                        return (
                            <g
                                key={node.anchor.id}
                                className="tree-node"
                                transform={`translate(${pos.x}, ${pos.y})`}
                            >
                                {/* Node rectangle */}
                                <rect
                                    x={0}
                                    y={0}
                                    width={nodeWidth}
                                    height={nodeHeight}
                                    fill={fillColor}
                                    stroke={strokeColor}
                                    strokeWidth="2"
                                    rx="8"
                                />

                                {/* Title */}
                                <text
                                    x={nodeWidth / 2}
                                    y={22}
                                    textAnchor="middle"
                                    fill={textColor}
                                    fontSize="12"
                                    fontWeight={node.isFocused ? 'bold' : 'normal'}
                                >
                                    {lines.map((line, i) => (
                                        <tspan key={i} x={nodeWidth / 2} dy={i === 0 ? 0 : '1.1em'}>
                                            {line}
                                        </tspan>
                                    ))}
                                </text>

                                {/* Buttons */}
                                <g>
                                    {/* Left button (Explore/Collapse) */}
                                    {showLeftButton && (
                                        <g
                                            onClick={leftButtonAction}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <rect
                                                x={10}
                                                y={nodeHeight - 28}
                                                width={nodeWidth / 2 - 15}
                                                height={22}
                                                fill={node.isFocused ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}
                                                stroke={node.isFocused ? 'white' : '#666'}
                                                strokeWidth="1"
                                                rx="4"
                                            />
                                            <text
                                                x={nodeWidth / 4 + 5}
                                                y={nodeHeight - 13}
                                                textAnchor="middle"
                                                fill={textColor}
                                                fontSize="10"
                                                fontWeight="bold"
                                            >
                                                {leftButtonText}
                                            </text>
                                        </g>
                                    )}

                                    {/* Right button (Read - always present) */}
                                    <g
                                        onClick={() => handleReadNarrative(node.anchor.id)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <rect
                                            x={showLeftButton ? nodeWidth / 2 + 5 : 10}
                                            y={nodeHeight - 28}
                                            width={showLeftButton ? nodeWidth / 2 - 15 : nodeWidth - 20}
                                            height={22}
                                            fill={node.isFocused ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}
                                            stroke={node.isFocused ? 'white' : '#666'}
                                            strokeWidth="1"
                                            rx="4"
                                        />
                                        <text
                                            x={showLeftButton ? 3 * nodeWidth / 4 : nodeWidth / 2}
                                            y={nodeHeight - 13}
                                            textAnchor="middle"
                                            fill={textColor}
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