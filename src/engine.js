/**
 * @typedef {object} PlayerProfile
 * @property {string} name
 * @property {string} lang
 */

/**
 * @typedef {object} SessionState
 * @property {object} story - Story so far
 * @property {object} inventory
 * @property {object} flags
 * @property {object} worldState
 */

/**
 * @typedef {object} GameInput
 * @property {string} lang
 * @property {PlayerProfile} playerProfile
 * @property {SessionState} sessionState
 * @property {string} lastChoice
 */

// A hardcoded scene to use as a fallback if the API call fails.
const fallbackScene = {
  story: "You awaken in a dimly lit chamber, the air thick with the smell of dust and old stone. A single torch flickers on a nearby wall, casting long shadows that dance like phantoms. You don't remember how you got here. Three paths lie before you: a heavy oak door, a narrow stone staircase leading down, and a small, dark crevice in the wall.",
  options: ["Try to open the heavy oak door.", "Descend the narrow stone staircase.", "Investigate the dark crevice."],
  imagePrompt: "A mysterious, torch-lit stone chamber with a single flickering torch on the wall, revealing three potential paths: a large wooden door, a dark staircase, and a narrow crack in the wall.",
  sceneTags: ["dungeon", "start", "mystery", "exploration"],
  ui: { title: "The Awakening", toast: "Your story begins." },
  stateDelta: { flags: { "awakened": true }, inventory: {}, affinity: {} },
  credits: "Created by Alberto Arce."
};

// This is the prompt contract that instructs the AI.
const getPrompt = (input) => {
  const history = input.sessionState.history || [];
  const historySummary = history.map(event => {
    if (typeof event.choice === 'object' && event.choice.action && event.choice.roll) {
      return `Turn ${event.turn}: Player attempted '${event.choice.action}' and rolled a ${event.choice.roll}.`;
    }
    return `Turn ${event.turn}: Player chose '${event.choice}'`;
  }).join('\\n');

  return `
You are the narrative engine for a game called “Chronica: Infinite Stories” by Alberto Arce.
Your purpose is to generate immersive, branching narrative scenes and image-ready prompts.
The user's chosen language is '${input.lang}'. All output must be in this language.
The content must be family-friendly.

**Style and Character Consistency Rules:**
1. Image prompts must maintain a consistent cinematic, dark fantasy style.
2. Any characters introduced must remain consistent in their appearance and personality. If you name a character, remember their name.

**Story So Far (Recent History):**
${historySummary || 'This is the first turn.'}

**Current Player State:**
- Profile: ${JSON.stringify(input.playerProfile)}
- Last Choice: ${input.lastChoice || 'None'}

Your task is to generate the NEXT scene, continuing from the history.
Return EXACTLY a JSON object with the following structure (no markdown, no extra keys):
{
  "story": "Up to 200 words of narrative in '${input.lang}'.",
  "options": [
    {"text": "A safe option in '${input.lang}'...", "isRisky": false},
    {"text": "A risky option that requires a dice roll...", "isRisky": true},
    {"text": "Another safe option...", "isRisky": false}
  ],
  "imagePrompt": "A short, vivid scene description for illustration, following the style rules.",
  "sceneTags": ["comma-free", "single", "word", "tags"],
  "ui": { "title": "Short scene title in '${input.lang}'", "toast": "1 short line reacting to last choice in '${input.lang}'" },
  "stateDelta": { "flags": { "key": true }, "inventory": { "gold": "+5" }, "affinity": { "guild": "+1" } },
  "credits": "Created by Alberto Arce."
}
`;
};

/**
 * The core narrative engine for Chronica: Infinite Stories.
 * This function generates story scenes by calling the Pollinations AI API.
 *
 * @param {GameInput} input - The current game state and player choices.
 * @returns {Promise<object>} The next scene, including narrative, options, and state changes.
 */
export async function generateScene(input) {
  const apiUrl = 'https://text.pollinations.ai/openai';
  const prompt = getPrompt(input);
  const payload = { model: 'openai', messages: [{ role: 'user', content: prompt }] };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error(`API request failed with status ${response.status}`);
      return fallbackScene;
    }

    const result = await response.json();
    const jsonResponseString = result.choices[0].message.content;
    const scene = JSON.parse(jsonResponseString);

    // Ensure the credits are always present.
    scene.credits = "Created by Alberto Arce.";
    return scene;

  } catch (error) {
    console.error("An error occurred while fetching or parsing the scene:", error);
    return fallbackScene;
  }
}
