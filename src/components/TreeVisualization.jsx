import { useState, useEffect, useRef } from 'react';
import { treeStructure, getChildren, getAnchorById } from '../data/treeStructure';

function TreeVisualization() {
    const [expandedNodeId, setExpandedNodeId] = useState(null); // Which node is currently expanded
    const [animationPhase, setAnimationPhase] = useState('idle'); // Track animation state
    const [fadingOutNodes, setFadingOutNodes] = useState([]); // Nodes currently fading out
    const containerRef = useRef(null);

    // Layout constants
    const rowHeight = 140;

    // Scroll to center the expanded node (only for children, not ROOT)
    useEffect(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;

        if (expandedNodeId === null || expandedNodeId === '0-ROOT') {
            // ROOT at top - scroll to top
            container.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        } else {
            // A child is expanded - center that child
            const childY = 60 + rowHeight; // Children are in row 1
            const containerHeight = container.clientHeight;
            const scrollTop = childY - containerHeight / 2 + 40;
            container.scrollTo({
                top: scrollTop,
                behavior: 'smooth'
            });
        }
    }, [expandedNodeId]);

    // Initial scroll on mount - start at top
    useEffect(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;
        container.scrollTo({
            top: 0,
            behavior: 'auto'
        });
    }, []);

    const handleExplore = (anchorId) => {
        if (animationPhase !== 'idle') return;

        // Determine which siblings need to fade out
        if (anchorId !== '0-ROOT') {
            const rootChildren = getChildren('0-ROOT');
            const siblings = rootChildren.filter(child => child.id !== anchorId).map(child => child.id);
            setFadingOutNodes(siblings);
        }

        // Step 1: Fade out siblings (0-200ms)
        setAnimationPhase('fadingOutSiblings');

        setTimeout(() => {
            // Step 2: Move selected to center + remove faded siblings (200-600ms)
            setAnimationPhase('moving');
            setExpandedNodeId(anchorId);
            setFadingOutNodes([]); // Remove faded nodes from DOM
        }, 200);

        setTimeout(() => {
            // Step 3: Change color (600-750ms)
            setAnimationPhase('colorChange');
        }, 600);

        setTimeout(() => {
            // Step 4: Fade in children (750-1000ms)
            setAnimationPhase('fadingInChildren');
        }, 750);

        setTimeout(() => {
            // Done
            setAnimationPhase('idle');
        }, 1000);
    };

    const handleCollapse = (anchorId) => {
        if (animationPhase !== 'idle') return;

        // Step 1: Fade out children (0-125ms) - reduced from 250ms
        setAnimationPhase('fadingOutChildren');

        setTimeout(() => {
            // Step 2: Change color back (125-200ms) - reduced from 250-400ms
            setAnimationPhase('colorChangeReverse');
        }, 125);

        setTimeout(() => {
            // Step 3: Move back (200-600ms) - starts earlier, same duration
            setAnimationPhase('movingReverse');
        }, 200);

        setTimeout(() => {
            // Step 4: Show and fade in siblings (600-800ms)
            setAnimationPhase('fadingInSiblings');
            // Now update expandedNodeId to show siblings
            if (anchorId === '0-ROOT') {
                setExpandedNodeId(null);
            } else {
                setExpandedNodeId('0-ROOT');
            }
        }, 600);

        setTimeout(() => {
            // Done - total 800ms now instead of 1000ms
            setAnimationPhase('idle');
        }, 800);
    };

    // Determine which nodes should be rendered
    const getVisibleNodes = () => {
        const nodes = [];
        const root = getAnchorById('0-ROOT');

        // ROOT always visible
        nodes.push({
            anchor: root,
            id: root.id,
            type: 'root'
        });

        // If ROOT is expanded or a child is expanded, show level 1 children
        if (expandedNodeId !== null) {
            const rootChildren = getChildren('0-ROOT');

            if (expandedNodeId === '0-ROOT') {
                // All children visible
                rootChildren.forEach(child => {
                    nodes.push({
                        anchor: child,
                        id: child.id,
                        type: 'level1',
                        isExpanded: false
                    });
                });
            } else {
                // Only expanded child visible (plus fading siblings)
                rootChildren.forEach(child => {
                    if (child.id === expandedNodeId) {
                        nodes.push({
                            anchor: child,
                            id: child.id,
                            type: 'level1',
                            isExpanded: true
                        });
                    } else if (fadingOutNodes.includes(child.id)) {
                        // Sibling still in DOM while fading
                        nodes.push({
                            anchor: child,
                            id: child.id,
                            type: 'level1',
                            isExpanded: false,
                            isFading: true
                        });
                    } else if (animationPhase === 'fadingInSiblings') {
                        // Siblings coming back during collapse - only during fadingInSiblings phase
                        nodes.push({
                            anchor: child,
                            id: child.id,
                            type: 'level1',
                            isExpanded: false,
                            isFadingIn: true
                        });
                    }
                });

                // Show children of expanded node
                if (expandedNodeId) {
                    const expandedChildren = getChildren(expandedNodeId);
                    expandedChildren.forEach(child => {
                        nodes.push({
                            anchor: child,
                            id: child.id,
                            type: 'level2',
                            isExpanded: false
                        });
                    });
                }
            }
        }

        return nodes;
    };

    const visibleNodes = getVisibleNodes();

    // Layout constants
    const nodeWidth = 200;
    const nodeHeight = 80;
    const horizontalSpacing = 40;

    // Calculate position for a node
    const calculatePosition = (node) => {
        const containerWidth = 1200;

        if (node.type === 'root') {
            return {
                x: (containerWidth - nodeWidth) / 2,
                y: 60
            };
        }

        if (node.type === 'level1') {
            const rootChildren = getChildren('0-ROOT');
            const nodeIndex = rootChildren.findIndex(c => c.id === node.id);

            // During movingReverse, previously expanded box should move to spread-out position
            if (node.isExpanded && (animationPhase === 'movingReverse' || animationPhase === 'fadingInSiblings')) {
                // Calculate spread-out position
                const totalInRow = rootChildren.length;
                const rowWidth = totalInRow * nodeWidth + (totalInRow - 1) * horizontalSpacing;
                const rowStartX = (containerWidth - rowWidth) / 2;
                return {
                    x: rowStartX + nodeIndex * (nodeWidth + horizontalSpacing),
                    y: 60 + rowHeight
                };
            } else if (node.isExpanded) {
                // Centered position when expanded
                return {
                    x: (containerWidth - nodeWidth) / 2,
                    y: 60 + rowHeight
                };
            } else {
                // Spread out position
                const totalInRow = rootChildren.length;
                const rowWidth = totalInRow * nodeWidth + (totalInRow - 1) * horizontalSpacing;
                const rowStartX = (containerWidth - rowWidth) / 2;
                return {
                    x: rowStartX + nodeIndex * (nodeWidth + horizontalSpacing),
                    y: 60 + rowHeight
                };
            }
        }

        if (node.type === 'level2') {
            const parentId = expandedNodeId;
            const parentChildren = getChildren(parentId);
            const nodeIndex = parentChildren.findIndex(c => c.id === node.id);
            const totalInRow = parentChildren.length;

            const rowWidth = totalInRow * nodeWidth + (totalInRow - 1) * horizontalSpacing;
            const rowStartX = (containerWidth - rowWidth) / 2;

            return {
                x: rowStartX + nodeIndex * (nodeWidth + horizontalSpacing),
                y: 60 + 2 * rowHeight
            };
        }

        return { x: 0, y: 0 };
    };

    // Calculate opacity for a node
    const calculateOpacity = (node) => {
        // Fading out siblings
        if (node.isFading) {
            return 0;
        }

        // Fading in siblings during collapse
        if (node.isFadingIn) {
            if (animationPhase === 'fadingInSiblings') {
                return 1;
            } else {
                return 0;
            }
        }

        // Level 2 children fading in/out
        if (node.type === 'level2') {
            if (animationPhase === 'fadingOutSiblings' || animationPhase === 'moving' || animationPhase === 'colorChange') {
                return 0;
            } else if (animationPhase === 'fadingInChildren' || animationPhase === 'idle') {
                return 1;
            } else if (animationPhase === 'fadingOutChildren' || animationPhase === 'colorChangeReverse' || animationPhase === 'movingReverse') {
                return 0;
            }
        }

        return 1;
    };

    // Calculate color for a node
    const calculateColor = (node) => {
        // Any expanded node (including ROOT) turns dark grey
        if (node.isExpanded || (node.type === 'root' && expandedNodeId === '0-ROOT')) {
            // Only show dark color after colorChange phase
            if (animationPhase === 'colorChange' || animationPhase === 'fadingInChildren' || animationPhase === 'idle') {
                return {
                    fill: '#555555',
                    text: 'white',
                    stroke: '#333333'
                };
            }
        }

        return {
            fill: '#e0e0e0',
            text: 'black',
            stroke: '#999999'
        };
    };

    const svgWidth = 1200;
    const svgHeight = 60 + 4 * rowHeight;

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

                        let showLeftButton = false;
                        let leftButtonText = '';
                        let leftButtonAction = null;

                        if (node.type === 'root') {
                            showLeftButton = true;
                            if (expandedNodeId === null) {
                                leftButtonText = 'Explore ▼';
                                leftButtonAction = () => handleExplore('0-ROOT');
                            } else {
                                leftButtonText = 'Collapse ▲';
                                leftButtonAction = () => handleCollapse('0-ROOT');
                            }
                        } else if (node.isExpanded) {
                            showLeftButton = true;
                            leftButtonText = 'Collapse ▲';
                            leftButtonAction = () => handleCollapse(node.anchor.id);
                        } else if (hasChildren && !node.isFading && opacity > 0) {
                            showLeftButton = true;
                            leftButtonText = 'Explore ▼';
                            leftButtonAction = () => handleExplore(node.anchor.id);
                        }

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
                                    {showLeftButton && (
                                        <g onClick={leftButtonAction} style={{ cursor: 'pointer' }}>
                                            <rect
                                                x={10}
                                                y={nodeHeight - 28}
                                                width={nodeWidth / 2 - 15}
                                                height={22}
                                                fill={node.isExpanded && colors.fill === '#555555' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}
                                                stroke={node.isExpanded && colors.fill === '#555555' ? 'white' : '#666'}
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
                                                {leftButtonText}
                                            </text>
                                        </g>
                                    )}

                                    <g onClick={() => console.log('Read:', node.anchor.id)} style={{ cursor: 'pointer' }}>
                                        <rect
                                            x={showLeftButton ? nodeWidth / 2 + 5 : 10}
                                            y={nodeHeight - 28}
                                            width={showLeftButton ? nodeWidth / 2 - 15 : nodeWidth - 20}
                                            height={22}
                                            fill={node.isExpanded && colors.fill === '#555555' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}
                                            stroke={node.isExpanded && colors.fill === '#555555' ? 'white' : '#666'}
                                            strokeWidth="1"
                                            rx="4"
                                        />
                                        <text
                                            x={showLeftButton ? 3 * nodeWidth / 4 : nodeWidth / 2}
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