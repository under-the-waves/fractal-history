// Fractal History Tree Structure
// This file defines the hierarchical anchor structure for the visual tree

// NOTE: Only level 0-1 anchors live here (these are the DB-seeded roots). All deeper anchors are
// generated on demand and read from the database via /api/get-tree. The old static level-2+ entries
// were vestigial duplicates not present in the DB and were removed 2026-06-28 (they shadowed real
// generation and broke Learn/narrative for Industrial Revolution, Emergence, Evolution of Humans).
export const treeStructure = [
  {
    "id": "0-ROOT",
    "title": "The Story of Everything",
    "level": 0,
    "breadth": null,
    "parentId": null,
    "slug": "the-story-of-everything",
    "position": 1
  },
  {
    "id": "1A-E8F2G",
    "title": "Emergence of Life on Earth",
    "level": 1,
    "breadth": "A",
    "parentId": "0-ROOT",
    "slug": "emergence-of-life-on-earth",
    "position": 1
  },
  {
    "id": "1A-Q7R2S",
    "title": "Evolution of Humans",
    "level": 1,
    "breadth": "A",
    "parentId": "0-ROOT",
    "slug": "evolution-of-humans",
    "position": 2
  },
  {
    "id": "1A-G7H2K",
    "title": "Agricultural Revolution",
    "level": 1,
    "breadth": "A",
    "parentId": "0-ROOT",
    "slug": "agricultural-revolution",
    "position": 3
  },
  {
    "id": "1A-C9D3E",
    "title": "Industrial Revolution",
    "level": 1,
    "breadth": "A",
    "parentId": "0-ROOT",
    "slug": "industrial-revolution",
    "position": 4
  },
  {
    "id": "1B-T4U9V",
    "title": "Deep Time: 13.8 BYA - 3 MYA",
    "level": 1,
    "breadth": "B",
    "parentId": "0-ROOT",
    "slug": "deep-time",
    "position": 1
  },
  {
    "id": "1B-W1X6Y",
    "title": "Foraging Era: 3 MYA - 10,000 BCE",
    "level": 1,
    "breadth": "B",
    "parentId": "0-ROOT",
    "slug": "foraging-era",
    "position": 2
  },
  {
    "id": "1B-Z5A3B",
    "title": "Agricultural Civilizations: 10,000 BCE - 1500 CE",
    "level": 1,
    "breadth": "B",
    "parentId": "0-ROOT",
    "slug": "agricultural-civilizations",
    "position": 3
  },
  {
    "id": "1B-C8D2E",
    "title": "Early Modern: 1500 - 1900 CE",
    "level": 1,
    "breadth": "B",
    "parentId": "0-ROOT",
    "slug": "early-modern",
    "position": 4
  },
  {
    "id": "1B-F7G4H",
    "title": "Contemporary: 1900 - Present",
    "level": 1,
    "breadth": "B",
    "parentId": "0-ROOT",
    "slug": "contemporary",
    "position": 5
  },
  {
    "id": "1C-I6J1K",
    "title": "Cosmic & Planetary",
    "level": 1,
    "breadth": "C",
    "parentId": "0-ROOT",
    "slug": "cosmic-and-planetary",
    "position": 1
  },
  {
    "id": "1C-L3M8N",
    "title": "Africa",
    "level": 1,
    "breadth": "C",
    "parentId": "0-ROOT",
    "slug": "africa",
    "position": 2
  },
  {
    "id": "1C-O9P5Q",
    "title": "Eurasia",
    "level": 1,
    "breadth": "C",
    "parentId": "0-ROOT",
    "slug": "eurasia",
    "position": 3
  },
  {
    "id": "1C-R2S7T",
    "title": "Americas",
    "level": 1,
    "breadth": "C",
    "parentId": "0-ROOT",
    "slug": "americas",
    "position": 4
  },
  {
    "id": "1C-U4V1W",
    "title": "Oceania",
    "level": 1,
    "breadth": "C",
    "parentId": "0-ROOT",
    "slug": "oceania",
    "position": 5
  }
];

export const getChildren = (parentId, breadth = 'A') => {
    return treeStructure.filter(anchor =>
        anchor.parentId === parentId && anchor.breadth === breadth
    ).sort((a, b) => a.position - b.position);
};

// Helper function to get all available breadth levels for children of a parent
export const getAvailableBreadthLevels = (parentId) => {
    const children = treeStructure.filter(anchor => anchor.parentId === parentId);
    const breadthLevels = [...new Set(children.map(child => child.breadth))];
    return breadthLevels.sort();
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
export const buildNestedTree = (breadth = 'A') => {
    const root = getAnchorById("0-ROOT");

    const buildNode = (anchor) => ({
        ...anchor,
        children: getChildren(anchor.id, breadth).map(buildNode)
    });

    return buildNode(root);
};

// Get color for breadth level
export const getBreadthColor = (breadth) => {
    const colors = {
        'A': '#3498db', // Blue
        'B': '#27ae60', // Green
        'C': '#e67e22', // Orange
        'D': '#9b59b6', // Purple
        'E': '#e74c3c', // Red
    };
    return colors[breadth] || '#95a5a6';
};