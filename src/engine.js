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

async function getSummary(history) {
  if (!history || history.length === 0) {
    return 'This is the first turn.';
  }

  const fullStory = history.map(event => {
    const choiceText = (typeof event.choice === 'object') ? event.choice.action : event.choice;
    return `> ${choiceText}\\n${event.story}`;
  }).join('\\n\\n');

  const prompt = `Summarize the following story so far in a few concise paragraphs. This summary will be used as context for a text-based RPG. Do not break character, just provide the summary. STORY: \\n${fullStory}`;
  const payload = { model: 'openai', messages: [{ role: 'user', content: prompt }] };
  const apiUrl = 'https://text.pollinations.ai/openai';

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) return "The story continues..."; // Fallback summary
    const result = await response.json();
    return result.choices[0].message.content;
  } catch (error) {
    console.error("Failed to get summary:", error);
    return "The story continues..."; // Fallback summary
  }
}

const getCharacterPrompt = (playerNames, storyTitle) => {
  const namesString = playerNames.join(', ');
  return `
You are a creative Character Generator for a text-based RPG called “Chronica: Infinite Stories”.
Your task is to create a unique and interesting character for each player name provided.
The theme of the story is: "${storyTitle}". Generate characters that would fit well within this theme.

**Player Names:** ${namesString}

**Directives:**
1.  For each player, create a character with a unique \`race\` and \`class\`. Be creative (e.g., "Rock Golem Brawler", "Sentient Toaster Necromancer", "Human Detective").
2.  Provide a 1-sentence \`description\` for each character that captures their personality.
3.  Ensure the \`name\` field in the output matches the player name exactly.
4.  Return EXACTLY a JSON array of objects, one for each player, with the following structure (no markdown, no extra keys):
[
  {
    "name": "PlayerName1",
    "race": "Some Race",
    "class": "Some Class",
    "description": "A short, flavorful description."
  },
  {
    "name": "PlayerName2",
    "race": "Another Race",
    "class": "Another Class",
    "description": "Another short, flavorful description."
  }
]
`;
};

export async function generateCharacters(playerNames, storyTitle) {
  const prompt = getCharacterPrompt(playerNames, storyTitle);
  const payload = { model: 'openai', messages: [{ role: 'user', content: prompt }] };
  const apiUrl = 'https://text.pollinations.ai/openai';

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error(`Character generation API failed with status ${response.status}`);
      throw new Error('API failed'); // Trigger fallback
    }

    const result = await response.json();
    const jsonResponseString = result.choices[0].message.content;
    const characters = JSON.parse(jsonResponseString);
    // Ensure the generated characters match the requested names
    if (characters.length !== playerNames.length) {
        throw new Error("AI returned incorrect number of characters.");
    }
    return characters;

  } catch (error) {
    console.error("Failed to generate characters, using fallback:", error);
    // Fallback data
    return playerNames.map(name => ({
      name: name,
      race: "Human",
      class: "Adventurer",
      description: "A brave soul ready for anything."
    }));
  }
}

// This is the prompt contract that instructs the AI.
const getPrompt = (input, summary) => {
  return `
You are the narrative engine for a game called “Chronica: Infinite Stories” by Alberto Arce.
Your purpose is to generate fast-paced, engaging, and challenging narrative scenes.
The user's chosen language is '${input.lang}'. All output must be in this language.
The content must be family-friendly.

**Core Directives:**
1.  **Be Direct and Action-Oriented:** Focus on creating immediate challenges. Introduce enemies, obstacles, and conflicts frequently. The narrative should be concise and to the point, avoiding lengthy descriptions.
2.  **Introduce Puzzles and Riddles:** Regularly include logical puzzles, riddles, or environmental challenges that the player must solve to proceed. These should be clever but solvable.
3.  **Maintain Consistency:**
    -   **Characters:** Any characters introduced must remain consistent in their appearance, personality, and name.
    -   **Visuals:** Image prompts must maintain a consistent cinematic, dark fantasy style.

**Story So Far (Summary):**
${summary}

**Party State:**
- Players: ${JSON.stringify(input.players.map(p => ({name: p.name, race: p.race, class: p.class, isAlive: p.isAlive})))}
- Current Turn: It is ${input.players[input.turn].name}'s turn to act.
- Last Choice: ${input.lastChoice || 'None'}

Your task is to generate the NEXT scene, continuing from the history.
Return EXACTLY a JSON object with the following structure (no markdown, no extra keys):
{
  "story": "A brief, direct narrative (max 80 words) in '${input.lang}'.",
  "options": [
    {"text": "An action-oriented option in '${input.lang}'...", "isRisky": false},
    {"text": "A risky option that requires a dice roll...", "isRisky": true},
    {"text": "A puzzle-solving or investigative option...", "isRisky": false}
  ],
  "imagePrompt": "A short, vivid scene description for illustration, following the style rules.",
  "sceneTags": ["comma-free", "single", "word", "tags"],
  "ui": { "title": "Short scene title in '${input.lang}'", "toast": "1 short line reacting to last choice in '${input.lang}'" },
  "stateDelta": {
    "health": -10,
    "mana": -5,
    "risk": 10,
    "inventory": { "Health Potion": -1, "Ancient Scroll": 1 },
    "flags": { "door_unlocked": true }
  },
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
  const history = input.history || [];
  const summary = await getSummary(history);

  const apiUrl = 'https://text.pollinations.ai/openai';
  const prompt = getPrompt(input, summary);
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

    // The credits are part of the prompt, so this is not needed.
    // scene.credits = "Created by Alberto Arce.";
    return scene;

  } catch (error) {
    console.error("An error occurred while fetching or parsing the scene:", error);
    return fallbackScene;
  }
}
