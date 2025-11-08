export const LOADING_MESSAGES = [
  // Claude Code words
  'Accomplishing', 'Actioning', 'Actualizing', 'Baking', 'Brewing',
  'Calculating', 'Cerebrating', 'Churning', 'Clauding', 'Coalescing',
  'Cogitating', 'Computing', 'Conjuring', 'Considering', 'Cooking',
  'Crafting', 'Creating', 'Crunching', 'Deliberating', 'Determining',
  'Doing', 'Effecting', 'Finagling', 'Forging', 'Forming',
  'Generating', 'Hatching', 'Herding', 'Honking', 'Hustling',
  'Ideating', 'Inferring', 'Manifesting', 'Marinating', 'Moseying',
  'Mulling', 'Mustering', 'Musing', 'Noodling', 'Percolating',
  'Pondering', 'Processing', 'Puttering', 'Reticulating', 'Ruminating',
  'Schlepping', 'Shucking', 'Simmering', 'Smooshing', 'Spinning',
  'Stewing', 'Synthesizing', 'Thinking', 'Transmuting', 'Vibing',
  'Working',
  
  // Additional words
  'Contemplating', 'Architecting', 'Formulating', 'Orchestrating', 'Wrangling',
  'Scheming', 'Incubating', 'Distilling', 'Meandering', 'Tinkering',
  'Calibrating', 'Assembling', 'Cultivating', 'Navigating', 'Perusing',
  'Knitting', 'Harmonizing', 'Whirring', 'Crystallizing',
  
  // 20 more words
  'Brainstorming', 'Iterating', 'Exploring', 'Analyzing', 'Structuring',
  'Composing', 'Weaving', 'Sculpting', 'Refining', 'Polishing',
  'Optimizing', 'Streamlining', 'Untangling', 'Deciphering', 'Parsing',
  'Compiling', 'Rendering', 'Sketching', 'Blueprinting', 'Engineering'
] as const;

export type LoadingMessage = (typeof LOADING_MESSAGES)[number];
