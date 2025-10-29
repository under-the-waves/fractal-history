// Fractal History Tree Structure
// This file defines the hierarchical anchor structure for the visual tree

export const treeStructure = [
    // Level 0: ROOT
    {
        id: "0-ROOT",
        title: "The Story of Everything",
        level: 0,
        breadth: null,
        parentId: null,
        slug: "the-story-of-everything",
        position: 1
    },

    // Level 1A: Transformative Turning Points (5 anchors)
    {
        id: "1A-E8F2G",
        title: "Emergence of Life on Earth",
        level: 1,
        breadth: "A",
        parentId: "0-ROOT",
        slug: "emergence-of-life-on-earth",
        position: 1
    },
    {
        id: "1A-Q7R2S",
        title: "Evolution of Humans",
        level: 1,
        breadth: "A",
        parentId: "0-ROOT",
        slug: "evolution-of-humans",
        position: 2
    },
    {
        id: "1A-G7H2K",
        title: "Agricultural Revolution",
        level: 1,
        breadth: "A",
        parentId: "0-ROOT",
        slug: "agricultural-revolution",
        position: 3
    },
    {
        id: "1A-Z1A6B",
        title: "Scientific Revolution",
        level: 1,
        breadth: "A",
        parentId: "0-ROOT",
        slug: "scientific-revolution",
        position: 4
    },
    {
        id: "1A-C9D3E",
        title: "Industrial Revolution",
        level: 1,
        breadth: "A",
        parentId: "0-ROOT",
        slug: "industrial-revolution",
        position: 5
    },

    // Level 2A under 1A-E8F2G: Emergence of Life (3 anchors)
    {
        id: "2A-M3N8P",
        title: "Origin of Life",
        level: 2,
        breadth: "A",
        parentId: "1A-E8F2G",
        slug: "origin-of-life",
        position: 1
    },
    {
        id: "2A-K5L9M",
        title: "Photosynthesis and Oxygen",
        level: 2,
        breadth: "A",
        parentId: "1A-E8F2G",
        slug: "photosynthesis-and-oxygen",
        position: 2
    },
    {
        id: "2A-T4U7V",
        title: "Complex Cells",
        level: 2,
        breadth: "A",
        parentId: "1A-E8F2G",
        slug: "complex-cells",
        position: 3
    },

    // Level 2A under 1A-Q7R2S: Evolution of Humans (3 anchors)
    {
        id: "2A-W8X1Y",
        title: "Cognitive Evolution",
        level: 2,
        breadth: "A",
        parentId: "1A-Q7R2S",
        slug: "cognitive-evolution",
        position: 1
    },
    {
        id: "2A-B6C2D",
        title: "Tool-making",
        level: 2,
        breadth: "A",
        parentId: "1A-Q7R2S",
        slug: "tool-making",
        position: 2
    },
    {
        id: "2A-F9G4H",
        title: "Language and Culture",
        level: 2,
        breadth: "A",
        parentId: "1A-Q7R2S",
        slug: "language-and-culture",
        position: 3
    },

    // Level 2A under 1A-G7H2K: Agricultural Revolution (4 anchors)
    {
        id: "2A-Z5A3B",
        title: "Plant Domestication",
        level: 2,
        breadth: "A",
        parentId: "1A-G7H2K",
        slug: "plant-domestication",
        position: 1
    },
    {
        id: "2A-J7K1L",
        title: "Animal Domestication",
        level: 2,
        breadth: "A",
        parentId: "1A-G7H2K",
        slug: "animal-domestication",
        position: 2
    },
    {
        id: "2A-P8Q5R",
        title: "Permanent Settlements",
        level: 2,
        breadth: "A",
        parentId: "1A-G7H2K",
        slug: "permanent-settlements",
        position: 3
    },
    {
        id: "2A-N2O6S",
        title: "Social Complexity",
        level: 2,
        breadth: "A",
        parentId: "1A-G7H2K",
        slug: "social-complexity",
        position: 4
    },

    // Level 2A under 1A-Z1A6B: Scientific Revolution (4 anchors)
    {
        id: "2A-V3W9X",
        title: "Heliocentrism",
        level: 2,
        breadth: "A",
        parentId: "1A-Z1A6B",
        slug: "heliocentrism",
        position: 1
    },
    {
        id: "2A-R4S8T",
        title: "Mathematical Physics",
        level: 2,
        breadth: "A",
        parentId: "1A-Z1A6B",
        slug: "mathematical-physics",
        position: 2
    },
    {
        id: "2A-Y1Z7A",
        title: "Experimental Method",
        level: 2,
        breadth: "A",
        parentId: "1A-Z1A6B",
        slug: "experimental-method",
        position: 3
    },
    {
        id: "2A-L6M3N",
        title: "Scientific Institutions",
        level: 2,
        breadth: "A",
        parentId: "1A-Z1A6B",
        slug: "scientific-institutions",
        position: 4
    },

    // Level 2A under 1A-C9D3E: Industrial Revolution (5 anchors)
    {
        id: "2A-H5I2J",
        title: "Coal and Steam Power",
        level: 2,
        breadth: "A",
        parentId: "1A-C9D3E",
        slug: "coal-and-steam-power",
        position: 1
    },
    {
        id: "2A-D8E4F",
        title: "Factory Production",
        level: 2,
        breadth: "A",
        parentId: "1A-C9D3E",
        slug: "factory-production",
        position: 2
    },
    {
        id: "2A-A9B7C",
        title: "Industrial Transport",
        level: 2,
        breadth: "A",
        parentId: "1A-C9D3E",
        slug: "industrial-transport",
        position: 3
    },
    {
        id: "2A-X6Y1Z",
        title: "Capitalist Economics",
        level: 2,
        breadth: "A",
        parentId: "1A-C9D3E",
        slug: "capitalist-economics",
        position: 4
    },
    {
        id: "2A-O3P8Q",
        title: "Industrial Cities",
        level: 2,
        breadth: "A",
        parentId: "1A-C9D3E",
        slug: "industrial-cities",
        position: 5
    }
];

// Helper function to get children of a specific anchor
export const getChildren = (parentId) => {
    return treeStructure.filter(anchor => anchor.parentId === parentId)
        .sort((a, b) => a.position - b.position);
};

// Helper function to get an anchor by ID
export const getAnchorById = (id) => {
    return treeStructure.find(anchor => anchor.id === id);
};

// Helper function to get full path to an anchor (for breadcrumbs)
export const getAnchorPath = (id) => {
    const path = [];
    let current = getAnchorById(id);

    while (current) {
        path.unshift(current);
        current = current.parentId ? getAnchorById(current.parentId) : null;
    }

    return path;
};

// Helper function to build nested tree structure (useful for visualization)
export const buildNestedTree = () => {
    const root = getAnchorById("0-ROOT");

    const buildNode = (anchor) => ({
        ...anchor,
        children: getChildren(anchor.id).map(buildNode)
    });

    return buildNode(root);
};