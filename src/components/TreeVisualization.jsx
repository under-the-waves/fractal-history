import { useState, useEffect, useRef } from 'react';
import { treeStructure, getChildren, getAnchorById } from '../data/treeStructure';

function TreeVisualization() {
    const [expandedPath, setExpandedPath] = useState([]); // Array of expanded node IDs
    const [animationPhase, setAnimationPhase] = useState('idle');
    const [fadingOutNodes, setFadingOutNodes] = useState([]);
    const containerRef = useRef(null);

    // Layout constants
    const rowHeight = 140;

    // Scroll to center the deepest expanded node
    useEffect(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;

        if (expandedPath.length === 0) {
            // ROOT at top - scroll to top
            container.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        } else {
            // Center the deepest expanded node
            const depth = expandedPath.length;
            const nodeY = 60 + depth * rowHeight;
            const containerHeight = container.clientHeight;
            const scrollTop = nodeY - containerHeight / 2 + 40;
            container.scrollTo({
                top: scrollTop,
                behavior: 'smooth'
            });
        }
    }, [expandedPath]);

    // Initial scroll on mount
    useEffect(() => {
        if (!containerRef.current) return;
        containerRef.current.scrollTo({
            top: 0,
            behavior: 'auto'
        });
    }, []);

    const handleExplore = (anchorId) => {
        if (animationPhase !== 'idle') return;

        const anchor = getAnchorById(anchorId);
        const isRoot = anchorId === '0-ROOT';

        // Determine siblings that need to fade out
        if (!isRoot) {
            const parentId = anchor.parentId;
            const siblings = getChildren(parentId)
                .filter(child => child.id !== anchorId)
                .map(child => child.id);
            setFadingOutNodes(siblings);
        }

        // Step 1: Fade out siblings (0-200ms)
        setAnimationPhase('fadingOutSiblings');

        setTimeout(() => {
            // Step 2: Move selected to center + remove faded siblings (200-600ms)
            setAnimationPhase('moving');
            setExpandedPath([...expandedPath, anchorId]);
            setFadingOutNodes([]);
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

        // Step 1: Fade out children (0-125ms)
        setAnimationPhase('fadingOutChildren');

        setTimeout(() => {
            // Step 2: Change color back (125-200ms)
            setAnimationPhase('colorChangeReverse');
        }, 125);

        setTimeout(() => {
            // Step 3: Move back (200-600ms)
            setAnimationPhase('movingReverse');
        }, 200);

        setTimeout(() => {
            // Step 4: Show and fade in siblings (600-800ms)
            setAnimationPhase('fadingInSiblings');
            // Remove this node from expanded path
            const newPath = expandedPath.filter(id => id !== anchorId);
            setExpandedPath(newPath);
        }, 600);

        setTimeout(() => {
            // Done
            setAnimationPhase('idle');
        }, 800);
    };

    // Determine which nodes should be rendered
    const getVisibleNodes = () => {
        const nodes = [];
        const root = getAnchorById('0-ROOT');

        // ROOT always visible at top
        const isRootExpanded = expandedPath.length > 0 && expandedPath[0] === '0-ROOT';
        const isRootDeepest = expandedPath.length === 1 && expandedPath[0] === '0-ROOT';

        nodes.push({
            anchor: root,
            id: root.id,
            type: 'root',
            depth: 0,
            isExpanded: isRootDeepest // Only expanded if it's the deepest
        });

        // If nothing expanded, we're done
        if (expandedPath.length === 0) {
            return nodes;
        }

        // Special case: If only ROOT is expanded, show all Level 1 children
        if (expandedPath.length === 1 && expandedPath[0] === '0-ROOT') {
            const level1Children = getChildren('0-ROOT');
            level1Children.forEach(child => {
                nodes.push({
                    anchor: child,
                    id: child.id,
                    type: 'child',
                    depth: 1,
                    isExpanded: false
                });
            });
            return nodes;
        }

        // Walk through the expanded path (skip ROOT since it's already added)
        const pathWithoutRoot = expandedPath[0] === '0-ROOT' ? expandedPath.slice(1) : expandedPath;

        for (let i = 0; i < pathWithoutRoot.length; i++) {
            const expandedId = pathWithoutRoot[i];
            const parentId = i === 0 ? '0-ROOT' : pathWithoutRoot[i - 1];
            const allSiblings = getChildren(parentId);
            const isDeepest = i === pathWithoutRoot.length - 1;

            // Show the expanded node
            const expandedAnchor = getAnchorById(expandedId);
            nodes.push({
                anchor: expandedAnchor,
                id: expandedId,
                type: 'expanded',
                depth: i + 1,
                isExpanded: isDeepest // Only the deepest is visually expanded
            });

            // If this is the deepest expanded node, show its children
            if (isDeepest) {
                const children = getChildren(expandedId);
                children.forEach(child => {
                    nodes.push({
                        anchor: child,
                        id: child.id,
                        type: 'child',
                        depth: i + 2,
                        isExpanded: false
                    });
                });

                // Also show siblings during certain animation phases
                allSiblings.forEach(sibling => {
                    if (sibling.id !== expandedId) {
                        if (fadingOutNodes.includes(sibling.id)) {
                            nodes.push({
                                anchor: sibling,
                                id: sibling.id,
                                type: 'sibling',
                                depth: i + 1,
                                isExpanded: false,
                                isFading: true
                            });
                        } else if (animationPhase === 'fadingInSiblings') {
                            nodes.push({
                                anchor: sibling,
                                id: sibling.id,
                                type: 'sibling',
                                depth: i + 1,
                                isExpanded: false,
                                isFadingIn: true
                            });
                        }
                    }
                });
            }
        }

        return nodes;
    };

    const visibleNodes = getVisibleNodes();

    // Layout constants
    const nodeWidth = 200;
    const nodeHeight = 80;
    const horizontalSpacing = 40;

    // Calculate position for a node based on its depth and type
    const calculatePosition = (node) => {
        const containerWidth = 1200;

        // ROOT always centered at top
        if (node.type === 'root') {
            return {
                x: (containerWidth - nodeWidth) / 2,
                y: 60
            };
        }

        const rowY = 60 + node.depth * rowHeight;

        // Expanded nodes move to center
        if (node.isExpanded) {
            // During reverse animation, move back to spread position
            if (animationPhase === 'movingReverse' || animationPhase === 'fadingInSiblings') {
                // Calculate spread-out position among siblings
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
            } else {
                // Centered when expanded
                return {
                    x: (containerWidth - nodeWidth) / 2,
                    y: rowY
                };
            }
        }

        // Children and siblings spread out
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
        // Fading out siblings
        if (node.isFading) {
            return 0;
        }

        // Fading in siblings during collapse
        if (node.isFadingIn) {
            return animationPhase === 'fadingInSiblings' ? 1 : 0;
        }

        // Children fading in/out
        if (node.type === 'child') {
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
        // Any expanded node turns dark grey
        if (node.isExpanded) {
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
    const svgHeight = 60 + 6 * rowHeight; // Allow more rows for deeper nesting

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

                        if (node.isExpanded) {
                            showLeftButton = true;
                            leftButtonText = 'Collapse ▲';
                            leftButtonAction = () => handleCollapse(node.anchor.id);
                        } else if (hasChildren && !node.isFading && opacity > 0) {
                            // Don't show explore button on ROOT if already expanded
                            const isRootAlreadyExpanded = node.id === '0-ROOT' && expandedPath.length > 0;
                            if (!isRootAlreadyExpanded) {
                                showLeftButton = true;
                                leftButtonText = 'Explore ▼';
                                leftButtonAction = () => handleExplore(node.anchor.id);
                            }
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