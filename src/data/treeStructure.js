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
    },

    // Level 3 Anchors - Add these to the treeStructure array

    // Under 2A-M3N8P: Origin of Life
    {
        id: "3A-R7T2V",
        title: "First Self-Replicating Entities",
        level: 3,
        breadth: "A",
        parentId: "2A-M3N8P",
        slug: "first-self-replicating-entities",
        position: 1
    },
    {
        id: "3A-W4X8Z",
        title: "Early Anaerobic Life",
        level: 3,
        breadth: "A",
        parentId: "2A-M3N8P",
        slug: "early-anaerobic-life",
        position: 2
    },
    {
        id: "3A-B5D1F",
        title: "Stromatolite Fossil Evidence",
        level: 3,
        breadth: "A",
        parentId: "2A-M3N8P",
        slug: "stromatolite-fossil-evidence",
        position: 3
    },

    // Under 2A-K5L9M: Photosynthesis and Oxygen
    {
        id: "3A-S6T9U",
        title: "Invention of Photosynthesis",
        level: 3,
        breadth: "A",
        parentId: "2A-K5L9M",
        slug: "invention-of-photosynthesis",
        position: 1
    },
    {
        id: "3A-V2W7X",
        title: "Great Oxidation Event",
        level: 3,
        breadth: "A",
        parentId: "2A-K5L9M",
        slug: "great-oxidation-event",
        position: 2
    },
    {
        id: "3A-C3E7F",
        title: "Rise of Aerobic Organisms",
        level: 3,
        breadth: "A",
        parentId: "2A-K5L9M",
        slug: "rise-of-aerobic-organisms",
        position: 3
    },

    // Under 2A-T4U7V: Complex Cells
    {
        id: "3A-H5J9K",
        title: "Origin of Eukaryotic Cells",
        level: 3,
        breadth: "A",
        parentId: "2A-T4U7V",
        slug: "origin-of-eukaryotic-cells",
        position: 1
    },
    {
        id: "3A-L1M6N",
        title: "Evolution of Sexual Reproduction",
        level: 3,
        breadth: "A",
        parentId: "2A-T4U7V",
        slug: "evolution-of-sexual-reproduction",
        position: 2
    },
    {
        id: "3A-P8Q2R",
        title: "Emergence of Multicellular Life",
        level: 3,
        breadth: "A",
        parentId: "2A-T4U7V",
        slug: "emergence-of-multicellular-life",
        position: 3
    },
    {
        id: "3A-T7U3V",
        title: "Origin of Plants",
        level: 3,
        breadth: "A",
        parentId: "2A-T4U7V",
        slug: "origin-of-plants",
        position: 4
    },

    // Under 2A-W8X1Y: Cognitive Evolution
    {
        id: "3A-D8F3G",
        title: "Larger Brain Evolution",
        level: 3,
        breadth: "A",
        parentId: "2A-W8X1Y",
        slug: "larger-brain-evolution",
        position: 1
    },
    {
        id: "3A-M9N4P",
        title: "Social Cognition",
        level: 3,
        breadth: "A",
        parentId: "2A-W8X1Y",
        slug: "social-cognition",
        position: 2
    },
    {
        id: "3A-J6K2L",
        title: "Abstract Thinking",
        level: 3,
        breadth: "A",
        parentId: "2A-W8X1Y",
        slug: "abstract-thinking",
        position: 3
    },

    // Under 2A-B6C2D: Tool-making
    {
        id: "3A-V5W9X",
        title: "Oldowan Stone Tools",
        level: 3,
        breadth: "A",
        parentId: "2A-B6C2D",
        slug: "oldowan-stone-tools",
        position: 1
    },
    {
        id: "3A-Y2Z6A",
        title: "Acheulean Hand Axes",
        level: 3,
        breadth: "A",
        parentId: "2A-B6C2D",
        slug: "acheulean-hand-axes",
        position: 2
    },
    {
        id: "3A-C8D3E",
        title: "Hafting and Composite Tools",
        level: 3,
        breadth: "A",
        parentId: "2A-B6C2D",
        slug: "hafting-and-composite-tools",
        position: 3
    },
    {
        id: "3A-G1H7I",
        title: "Specialized Tool Kits",
        level: 3,
        breadth: "A",
        parentId: "2A-B6C2D",
        slug: "specialized-tool-kits",
        position: 4
    },

    // Under 2A-F9G4H: Language and Culture
    {
        id: "3A-K4L8M",
        title: "Evolution of Spoken Language",
        level: 3,
        breadth: "A",
        parentId: "2A-F9G4H",
        slug: "evolution-of-spoken-language",
        position: 1
    },
    {
        id: "3A-N6P2Q",
        title: "Symbolic Art and Ritual",
        level: 3,
        breadth: "A",
        parentId: "2A-F9G4H",
        slug: "symbolic-art-and-ritual",
        position: 2
    },
    {
        id: "3A-R9S5T",
        title: "Cultural Transmission",
        level: 3,
        breadth: "A",
        parentId: "2A-F9G4H",
        slug: "cultural-transmission",
        position: 3
    },

    // Under 2A-Z5A3B: Plant Domestication
    {
        id: "3A-B7D2E",
        title: "Unconscious Selection",
        level: 3,
        breadth: "A",
        parentId: "2A-Z5A3B",
        slug: "unconscious-selection",
        position: 1
    },
    {
        id: "3A-F5G9H",
        title: "Sedentism and Plant Cultivation",
        level: 3,
        breadth: "A",
        parentId: "2A-Z5A3B",
        slug: "sedentism-and-plant-cultivation",
        position: 2
    },
    {
        id: "3A-J3K8L",
        title: "Annual Crop Dependence",
        level: 3,
        breadth: "A",
        parentId: "2A-Z5A3B",
        slug: "annual-crop-dependence",
        position: 3
    },
    {
        id: "3A-M6N1P",
        title: "Seed Storage and Surplus",
        level: 3,
        breadth: "A",
        parentId: "2A-Z5A3B",
        slug: "seed-storage-and-surplus",
        position: 4
    },

    // Under 2A-J7K1L: Animal Domestication
    {
        id: "3A-Q8R4S",
        title: "Dog Domestication",
        level: 3,
        breadth: "A",
        parentId: "2A-J7K1L",
        slug: "dog-domestication",
        position: 1
    },
    {
        id: "3A-T2U7V",
        title: "Livestock Revolution",
        level: 3,
        breadth: "A",
        parentId: "2A-J7K1L",
        slug: "livestock-revolution",
        position: 2
    },
    {
        id: "3A-W9X5Y",
        title: "Large Animal Domestication",
        level: 3,
        breadth: "A",
        parentId: "2A-J7K1L",
        slug: "large-animal-domestication",
        position: 3
    },
    {
        id: "3A-Z3A6B",
        title: "Geographic Inequality in Domesticable Animals",
        level: 3,
        breadth: "A",
        parentId: "2A-J7K1L",
        slug: "geographic-inequality-domesticable-animals",
        position: 4
    },

    // Under 2A-P8Q5R: Permanent Settlements
    {
        id: "3A-C7D1E",
        title: "Early Villages",
        level: 3,
        breadth: "A",
        parentId: "2A-P8Q5R",
        slug: "early-villages",
        position: 1
    },
    {
        id: "3A-F4G8H",
        title: "Food Storage Technology",
        level: 3,
        breadth: "A",
        parentId: "2A-P8Q5R",
        slug: "food-storage-technology",
        position: 2
    },
    {
        id: "3A-I2J6K",
        title: "Urban Revolution",
        level: 3,
        breadth: "A",
        parentId: "2A-P8Q5R",
        slug: "urban-revolution",
        position: 3
    },
    {
        id: "3A-L9M3N",
        title: "Defensive Architecture",
        level: 3,
        breadth: "A",
        parentId: "2A-P8Q5R",
        slug: "defensive-architecture",
        position: 4
    },

    // Under 2A-N2O6S: Social Complexity
    {
        id: "3A-P5Q8R",
        title: "Emergence of Social Hierarchy",
        level: 3,
        breadth: "A",
        parentId: "2A-N2O6S",
        slug: "emergence-of-social-hierarchy",
        position: 1
    },
    {
        id: "3A-S1T4U",
        title: "Craft Specialization",
        level: 3,
        breadth: "A",
        parentId: "2A-N2O6S",
        slug: "craft-specialization",
        position: 2
    },
    {
        id: "3A-V7W2X",
        title: "Religious Institutions",
        level: 3,
        breadth: "A",
        parentId: "2A-N2O6S",
        slug: "religious-institutions",
        position: 3
    },
    {
        id: "3A-Y6Z9A",
        title: "State Formation",
        level: 3,
        breadth: "A",
        parentId: "2A-N2O6S",
        slug: "state-formation",
        position: 4
    },

    // Under 2A-V3W9X: Heliocentrism
    {
        id: "3A-C5D8E",
        title: "Ancient Greek Cosmology",
        level: 3,
        breadth: "A",
        parentId: "2A-V3W9X",
        slug: "ancient-greek-cosmology",
        position: 1
    },
    {
        id: "3A-F2G6H",
        title: "Islamic Astronomical Critiques",
        level: 3,
        breadth: "A",
        parentId: "2A-V3W9X",
        slug: "islamic-astronomical-critiques",
        position: 2
    },
    {
        id: "3A-I9J3K",
        title: "Copernican Revolution",
        level: 3,
        breadth: "A",
        parentId: "2A-V3W9X",
        slug: "copernican-revolution",
        position: 3
    },

    // Under 2A-R4S8T: Mathematical Physics
    {
        id: "3A-P6Q2R",
        title: "Greek Mathematical Science",
        level: 3,
        breadth: "A",
        parentId: "2A-R4S8T",
        slug: "greek-mathematical-science",
        position: 1
    },
    {
        id: "3A-S8T4U",
        title: "Medieval Mechanics",
        level: 3,
        breadth: "A",
        parentId: "2A-R4S8T",
        slug: "medieval-mechanics",
        position: 2
    },
    {
        id: "3A-Y5Z9A",
        title: "Newtonian Synthesis",
        level: 3,
        breadth: "A",
        parentId: "2A-R4S8T",
        slug: "newtonian-synthesis",
        position: 3
    },

    // Under 2A-Y1Z7A: Experimental Method
    {
        id: "3A-B3C8D",
        title: "Ancient and Islamic Empiricism",
        level: 3,
        breadth: "A",
        parentId: "2A-Y1Z7A",
        slug: "ancient-and-islamic-empiricism",
        position: 1
    },
    {
        id: "3A-E6F1G",
        title: "Bacon's Scientific Method",
        level: 3,
        breadth: "A",
        parentId: "2A-Y1Z7A",
        slug: "bacons-scientific-method",
        position: 2
    },
    {
        id: "3A-H9I4J",
        title: "Instrument Revolution",
        level: 3,
        breadth: "A",
        parentId: "2A-Y1Z7A",
        slug: "instrument-revolution",
        position: 3
    },

    // Under 2A-L6M3N: Scientific Institutions
    {
        id: "3A-N8O5P",
        title: "House of Wisdom and Translation Movement",
        level: 3,
        breadth: "A",
        parentId: "2A-L6M3N",
        slug: "house-of-wisdom-and-translation-movement",
        position: 1
    },
    {
        id: "3A-Q3R9S",
        title: "Universities and Scientific Societies",
        level: 3,
        breadth: "A",
        parentId: "2A-L6M3N",
        slug: "universities-and-scientific-societies",
        position: 2
    },
    {
        id: "3A-T6U2V",
        title: "Scientific Journals and Professionalization",
        level: 3,
        breadth: "A",
        parentId: "2A-L6M3N",
        slug: "scientific-journals-and-professionalization",
        position: 3
    },

    // Under 2A-H5I2J: Coal and Steam Power
    {
        id: "3A-D2F7G",
        title: "Coal Mining Expansion",
        level: 3,
        breadth: "A",
        parentId: "2A-H5I2J",
        slug: "coal-mining-expansion",
        position: 1
    },
    {
        id: "3A-H9J4K",
        title: "Steam Engine Development",
        level: 3,
        breadth: "A",
        parentId: "2A-H5I2J",
        slug: "steam-engine-development",
        position: 2
    },
    {
        id: "3A-L6M3N",
        title: "Steam Power Applications",
        level: 3,
        breadth: "A",
        parentId: "2A-H5I2J",
        slug: "steam-power-applications",
        position: 3
    },

    // Under 2A-D8E4F: Factory Production
    {
        id: "3A-P5Q9R",
        title: "Textile Mechanization",
        level: 3,
        breadth: "A",
        parentId: "2A-D8E4F",
        slug: "textile-mechanization",
        position: 1
    },
    {
        id: "3A-S2T7U",
        title: "Factory Discipline and Labor",
        level: 3,
        breadth: "A",
        parentId: "2A-D8E4F",
        slug: "factory-discipline-and-labor",
        position: 2
    },
    {
        id: "3A-V8W4X",
        title: "Mass Production Systems",
        level: 3,
        breadth: "A",
        parentId: "2A-D8E4F",
        slug: "mass-production-systems",
        position: 3
    },

    // Under 2A-A9B7C: Industrial Transport
    {
        id: "3A-Y3Z6A",
        title: "Railway Revolution",
        level: 3,
        breadth: "A",
        parentId: "2A-A9B7C",
        slug: "railway-revolution",
        position: 1
    },
    {
        id: "3A-B1C5D",
        title: "Steamship Dominance",
        level: 3,
        breadth: "A",
        parentId: "2A-A9B7C",
        slug: "steamship-dominance",
        position: 2
    },
    {
        id: "3A-E7F2G",
        title: "Time Standardization and Integration",
        level: 3,
        breadth: "A",
        parentId: "2A-A9B7C",
        slug: "time-standardization-and-integration",
        position: 3
    },

    // Under 2A-X6Y1Z: Capitalist Economics
    {
        id: "3A-H4I8J",
        title: "Wage Labor System",
        level: 3,
        breadth: "A",
        parentId: "2A-X6Y1Z",
        slug: "wage-labor-system",
        position: 1
    },
    {
        id: "3A-K9L3M",
        title: "Capital Accumulation and Investment",
        level: 3,
        breadth: "A",
        parentId: "2A-X6Y1Z",
        slug: "capital-accumulation-and-investment",
        position: 2
    },
    {
        id: "3A-N6O2P",
        title: "Boom-Bust Economic Cycles",
        level: 3,
        breadth: "A",
        parentId: "2A-X6Y1Z",
        slug: "boom-bust-economic-cycles",
        position: 3
    },

    // Under 2A-O3P8Q: Industrial Cities
    {
        id: "3A-Q5R1S",
        title: "Urban Population Explosion",
        level: 3,
        breadth: "A",
        parentId: "2A-O3P8Q",
        slug: "urban-population-explosion",
        position: 1
    },
    {
        id: "3A-T7U4V",
        title: "Urban Squalor and Disease",
        level: 3,
        breadth: "A",
        parentId: "2A-O3P8Q",
        slug: "urban-squalor-and-disease",
        position: 2
    },
    {
        id: "3A-W2X9Y",
        title: "Public Health Revolution",
        level: 3,
        breadth: "A",
        parentId: "2A-O3P8Q",
        slug: "public-health-revolution",
        position: 3
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