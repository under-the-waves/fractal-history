// Prototype display data for the generative-learning flow (anchor 1A-E8F2G only).
// LEARNER-FACING study material: verified facts, each card expandable into up to four layers
// (what happened / how we know / debates / story). Kept separate from the grading ground truth
// in prototype/emergence-of-life-facts.md, which the marking engine uses.
//
// Content rules (see project CLAUDE.md): plain English in whole sentences, define the few terms
// you must use on first use, spell out every acronym on first use, British spelling, state facts
// directly. Keep it light — communicate the core point clearly, do not pile up terms.
// Each layer is an array of short bullet points. Empty layers are not shown. `when` is a date
// label shown under the headline.
//
// "prelude" is scene-setting shown above the five numbered sub-anchors; it is NOT part of the
// marking rubric. The five subAnchors ARE the rubric.

export const EMERGENCE_FACTS = {
  id: '1A-E8F2G',
  title: 'Emergence of Life on Earth',
  scope:
    'The origin and early evolution of life on Earth, from the first self-replicating ' +
    'molecules to the first complex multicellular organisms. Roughly 4 billion to 600 million years ago.',

  prelude: {
    title: 'Before life: the early Earth',
    facts: [
      {
        headline: 'Earth formed and slowly cooled from a violent start.',
        when: 'About 4.5 to 4 billion years ago',
        what: [
          'Earth formed about 4.54 billion years ago, building up from dust and rock orbiting the young Sun. Soon after, a Mars-sized body struck it, and the flung-out debris formed the Moon.',
          'The young planet was molten and hostile. As it cooled, water vapour condensed into the first oceans, perhaps by about 4.4 billion years ago.',
          'The early air, belched out by volcanoes, held almost no oxygen. There was no life anywhere yet, only chemistry.',
        ],
        how: [
          'Earth’s age comes from meteorites, the leftover rubble of the Solar System’s birth, because Earth’s own surface has been recycled many times over. Clair Patterson dated them to about 4.55 billion years in 1956.',
          'The oldest known pieces of Earth itself are tiny crystals from the Jack Hills in Western Australia, about 4.4 billion years old. Their chemistry suggests liquid water was already present that early.',
        ],
        debates: [
          'The young Sun was about a third dimmer than today, which should have left Earth frozen solid. Yet the rocks show liquid water existed. How the planet stayed warm enough is unresolved; the leading idea is a thick blanket of carbon dioxide trapping heat.',
        ],
        vignettes: [
          'The Jack Hills crystals are no wider than a human hair. In 2014 scientists mapped the individual atoms inside one of them to prove its great age was real and not a measurement error.',
          'Patterson needed samples so free of contamination that he built one of the first "clean rooms". His long fight with stray lead later helped get lead banned from petrol.',
        ],
      },
    ],
  },

  subAnchors: [
    {
      title: 'Origin of Self-Replicating Molecules',
      facts: [
        {
          headline: 'Life’s chemical building blocks can form on their own.',
          when: 'Around 4 billion years ago',
          what: [
            'Living things are built from molecules such as amino acids, the units that join together to make proteins.',
            'On the early Earth these building blocks formed naturally from simple chemicals and energy. Some also arrived from space, carried on meteorites.',
          ],
          how: [
            'In 1952 Stanley Miller sealed water and a few simple gases in a flask and ran electric sparks through it to imitate lightning. Within days, amino acids appeared, showing that life’s ingredients can form with no living thing involved.',
            'Meteorites that have landed on Earth, including one that fell in Australia in 1969, were found to carry amino acids that formed out in space.',
          ],
          debates: [
            'Scientists do not agree on where life began. The main candidates are warm, shallow pools at the surface, hot volcanic vents on the deep-sea floor, and pools that repeatedly dried out and refilled. Each can make some of the right chemistry in the laboratory, but none has yet produced life.',
          ],
          vignettes: [
            'Stanley Miller was a 22-year-old student when he ran his famous experiment, and several colleagues thought it was a waste of time. The result made headlines and launched a whole field of science.',
            'Charles Darwin had guessed at this in 1871, writing privately that life might have begun in "some warm little pond". He never published the idea, but it foreshadowed Miller’s experiment by about 80 years.',
          ],
        },
        {
          headline: 'A molecule that could copy itself began life and evolution.',
          when: 'About 3.8 to 3.5 billion years ago',
          what: [
            'At some point a molecule appeared that could make copies of itself. The leading suspect is RNA (ribonucleic acid), a close chemical cousin of DNA (deoxyribonucleic acid), the molecule that carries our genes.',
            'Copying is never perfect, so small errors crept in, and the versions that copied best became more common. This is the beginning of evolution by natural selection.',
          ],
          how: [
            'In the 1980s scientists found that RNA can do two jobs at once: carry information and speed up chemical reactions. That makes it a believable single molecule for the very first life, before DNA and proteins later divided the work between them.',
            'A trace of this survives in every living cell today: the tiny machine that builds proteins does its central work using RNA.',
          ],
          debates: [
            'It is still argued whether the first step was a copying molecule like RNA, or instead a self-sustaining cycle of chemical reactions, with genes arriving later. No experiment has yet turned non-living chemicals into a living thing, so the question stays open.',
          ],
          vignettes: [
            'For decades it was textbook fact that only proteins could speed up reactions in living things. The discovery that RNA can do it too overturned that belief and won a Nobel Prize in 1989.',
          ],
        },
      ],
    },

    {
      title: 'Evolution of Photosynthesis',
      facts: [
        {
          headline: 'Microbes learned to feed on sunlight, and gave off oxygen.',
          when: 'Around 3.5 to 2.4 billion years ago',
          what: [
            'Tiny microbes called cyanobacteria learned to make their own food from sunlight, water and carbon dioxide. This is photosynthesis, the same process plants use today.',
            'It gave life an almost limitless energy source, because the Sun never runs out. The waste product was oxygen, which the microbes released into the water and air.',
          ],
          how: [
            'Cyanobacteria built layered, rocky mounds called stromatolites in shallow seas. Fossil mounds over 3 billion years old survive in Western Australia.',
            'The same kind of microbe still builds identical mounds today at Shark Bay in Australia, which lets scientists confirm the ancient ones were made by living things.',
          ],
          debates: [
            'Exactly when microbes first learned to make oxygen is not settled, with estimates spread across more than a billion years. The difficulty is that oxygen was being produced long before it built up enough to leave a clear, lasting mark in the rocks.',
          ],
          vignettes: [
            'The living mounds at Shark Bay were found by chance in 1956 by surveyors working for an oil company. They survive there because the water is about twice as salty as the sea, so the creatures that would normally eat the microbes cannot live there.',
          ],
        },
      ],
    },

    {
      title: 'Great Oxidation Event',
      facts: [
        {
          headline: 'Oxygen finally flooded the oceans and the air.',
          when: 'About 2.4 billion years ago',
          what: [
            'For a long time the oxygen made by microbes was soaked up as fast as it appeared, mostly by reacting with iron dissolved in the oceans.',
            'Once the oceans could absorb no more, oxygen built up in the air for the first time. This turning point is called the Great Oxidation Event.',
          ],
          how: [
            'As the oceans "rusted", they left thick bands of iron-rich rock, found around the world and still mined for iron today. These mark when oxygen appeared.',
            'A particular chemical fingerprint in sulphur, which can only form in air with almost no oxygen, disappears from the rocks after about 2.4 billion years ago. That disappearance is the clearest sign of the change.',
          ],
          debates: [
            'Whether oxygen rose in one fairly sudden surge, or climbed in fits and starts over tens of millions of years, is still debated. Part of the problem is that rocks of the same age in different places seem to tell slightly different stories.',
          ],
          vignettes: [
            'The vast iron deposits that record this event supply most of the iron the world mines today.',
          ],
        },
        {
          headline: 'Oxygen poisoned existing life and froze the planet.',
          when: 'About 2.4 to 2.2 billion years ago',
          what: [
            'Oxygen was poisonous to almost all the life of the time, which had evolved without it. Many of those microbes are thought to have died out.',
            'Oxygen also destroyed methane, a gas that had been trapping heat and keeping the planet warm. With that blanket gone, Earth fell into one of its longest ice ages, possibly lasting hundreds of millions of years.',
          ],
          how: [
            'Rocks left behind by these ancient ice sheets, found near Lake Huron in Canada, sit right beside the layers that record the rise of oxygen, which ties the two events together.',
          ],
          debates: [
            'How many kinds of life the rise of oxygen actually killed is uncertain, because these ancient, soft microbes left almost no fossils. The dramatic nickname "oxygen catastrophe" may overstate it.',
          ],
          vignettes: [],
        },
      ],
    },

    {
      title: 'Endosymbiosis and Eukaryotic Cells',
      facts: [
        {
          headline: 'Complex cells were born when one microbe swallowed another.',
          when: 'About 2 to 1.5 billion years ago',
          what: [
            'All life so far had been made of simple, small cells. Then one cell swallowed another and, instead of digesting it, kept it alive inside.',
            'The swallowed bacterium became the cell’s power generator. A separate swallowing of a sunlight-feeding microbe became the green energy units in plants.',
            'This merger produced the large, complex cells (called eukaryotes) that all animals, plants and fungi are made of.',
          ],
          how: [
            'These power units still carry their own small, separate loop of DNA, left over from when they were free-living bacteria.',
            'They also divide on their own, and the same antibiotics that kill bacteria interfere with them, betraying their bacterial past.',
          ],
          debates: [
            'Exactly which ancient microbe did the swallowing, and whether the merger happened before or after cells grew complex in other ways, is still being worked out.',
          ],
          vignettes: [
            'Lynn Margulis proposed this idea in 1967, and it was reportedly rejected by about fifteen journals before one would print it. Ridiculed for years, it is now standard textbook science.',
          ],
        },
      ],
    },

    {
      title: 'First Multicellular Organisms',
      facts: [
        {
          headline: 'Cells joined together into the first bodies.',
          when: 'From about 1 billion years ago',
          what: [
            'Single cells began living together and sharing the work, with different cells taking on different jobs. This is multicellular life.',
            'It happened separately many times, in several unrelated groups, rather than just once.',
          ],
          how: [
            'One of the oldest clear examples is a fossil red seaweed from about 1 billion years ago, found in Arctic Canada, which already shows distinct types of cell.',
          ],
          debates: [
            'Why complex bodies took so long to appear, more than a billion years after complex cells, is unresolved. A common idea is that rising oxygen levels finally made larger, active bodies possible.',
          ],
          vignettes: [],
        },
        {
          headline: 'The first large, complex creatures: the Ediacarans.',
          when: 'About 575 to 539 million years ago',
          what: [
            'The Ediacarans were the first big, complex living things: soft-bodied creatures that lay on the seafloor. They had no shells, eyes, mouths or guts.',
            'Most of them vanished just before the "Cambrian explosion" about 539 million years ago, the burst of new life when animals with shells, eyes and the ability to move first appeared.',
          ],
          how: [
            'They survive as imprints in stone at famous sites in Australia, Canada and England.',
            'Beside one creature, scientists found scratch marks in the ancient seabed, suggesting it crept along grazing for food like an animal.',
          ],
          debates: [
            'Scientists still cannot agree what most Ediacarans even were. Suggestions range from early animals, to fungi, to a completely separate kind of life that left no descendants.',
          ],
          vignettes: [
            'The first one found in England was spotted around 1956 by a schoolgirl, Tina Negus, but her teacher dismissed it because complex life was thought impossible that far back. A schoolboy, Roger Mason, found the same fossil a year later, it was finally taken seriously, and the species was named after him.',
            'In Australia, the geologist Reg Sprigg noticed these fossils in 1946, reportedly while eating his lunch. His report was rejected and doubted for years before he was proved right.',
          ],
        },
      ],
    },
  ],
}

// The sub-anchor titles, used as the coverage rubric reminder while writing.
export const EMERGENCE_RUBRIC = EMERGENCE_FACTS.subAnchors.map((s) => s.title)
