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

const getEndingPrompt = (finalState, lang) => {
  return `
You are the epilogue writer for a text-based RPG called “Chronica: Infinite Stories”.
Your task is to write a short, flavorful, and conclusive final paragraph for the adventure in the specified language.

**Language:** ${lang}
**Game Title:** ${finalState.storyTitle}
**Game Over Reason:** ${finalState.reason}
**Final Party State:** ${JSON.stringify(finalState.players.map(p => ({ name: p.name, health: p.health, isAlive: p.isAlive })))}

**Directives:**
1.  Write a single, compelling paragraph in ${lang} that serves as an epilogue.
2.  If the reason is "time_up", describe how the party was overwhelmed or ran out of time.
3.  If the reason is "party_defeated", describe their noble (or ignoble) final stand.
4.  Reference the final state of the players. If some survived, mention them. If all perished, reflect on their legacy.
5.  The tone should match the game's title and theme.
6.  Do not output JSON. Output only the raw text of the epilogue paragraph in ${lang}.
`;
};

export async function generateEnding(finalState, lang) {
  const prompt = getEndingPrompt(finalState, lang);
  const payload = { model: 'openai', messages: [{ role: 'user', content: prompt }] };
  const apiUrl = 'https://text.pollinations.ai/openai';

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('API failed');
    const result = await response.json();
    return result.choices[0].message.content;
  } catch (error) {
    console.error("Failed to generate ending:", error);
    return "And so, the adventure concluded, its final tales lost to the winds of time."; // Fallback
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

const getRiddlePrompt = (input) => {
    const usedRiddlesText = input.usedRiddles.length > 0
        ? `\n**IMPORTANT:** Do not repeat any riddles from this list:\n- ${input.usedRiddles.join('\n- ')}`
        : '';

    return `
You are a master of puzzles and riddles for the RPG “Chronica: Infinite Stories”.
Your task is to generate a single, clever, and UNIQUE riddle or puzzle.
The theme of the story is: "${input.storyTitle}". The riddle should fit this theme.
The user's language is '${input.lang}'.
${usedRiddlesText}

**Directives:**
1.  Generate a single riddle. This can be a classic word riddle, a simple math puzzle, or a logic problem.
2.  Provide exactly three options for the answer.
3.  One option must be the correct answer. The other two must be plausible but incorrect.
4.  Return EXACTLY a JSON object with the following structure (no markdown, no extra keys):
{
  "acertijo": "The text of the riddle goes here.",
  "opciones": [
    {
      "texto": "A correct answer.",
      "correcta": true
    },
    {
      "texto": "An incorrect answer.",
      "correcta": false
    },
    {
      "texto": "Another incorrect answer.",
      "correcta": false
    }
  ]
}
`;
};

const getFirstScenePrompt = (input) => {
    const plot = input.plot;
    const characterDescriptions = JSON.stringify(input.players.map(p => ({ name: p.name, race: p.race, class: p.class, description: p.description })));

    return `
You are the master storyteller for the text-based RPG “Chronica: Infinite Stories”.
Your task is to write a compelling introductory scene for the story.

**Language:** ${input.lang}
**Story Title:** "${plot.title}"
**Overall Plot Summary:** ${plot.summary}
**Characters:** ${characterDescriptions}

**Directives:**
1.  **Protagonists:** The players are the protagonists of the story.
2.  **Set the Scene:** Write a detailed opening paragraph in ${input.lang} that establishes the setting and mood, based on the **Overall Plot Summary** and **Story Title**. Describe the scene before the action starts.
3.  **Introduce the Heroes:** Introduce each character from the **Characters** list, weaving their description into the narrative. Mention their roles and abilities. If there are any NPCs, introduce them as well.
4.  **Present the Inciting Incident:** Conclude the text by describing the very first situation or challenge the party faces, which should align with the first scene's goal: "${plot.scenes[0].description}".
5.  **Create Options:** Generate three clear, action-oriented options for the players to choose from as their first move.
6.  **Return JSON:** Return EXACTLY a JSON object with the specified structure, identical to the standard scene generation.
{
  "story": "Your introductory text (2-3 paragraphs).",
  "options": [
    {"text": "First action option...", "isRisky": false, "stateDelta": {}},
    {"text": "Second action option...", "isRisky": false, "stateDelta": {}},
    {"text": "Third action option...", "isRisky": false, "stateDelta": {}}
  ],
  "imagePrompt": "A vivid scene description for the introduction.",
  "sceneTags": ["introduction", "prologue"],
  "stateDelta": { "worldState": {} },
  "ui": { "title": "The Adventure Begins", "toast": "Your story unfolds..." },
  "credits": "Created by Alberto Arce."
}
`;
};

// This is the prompt contract that instructs the AI.
const getPrompt = (input, summary, options = {}) => {
  if (options.isRiddleTurn) {
    return getRiddlePrompt(input);
  }

  // For the very first scene, use a special introductory prompt.
  if (input.sceneIndex === 0) {
      return getFirstScenePrompt(input);
  }

    const currentSceneGoal = input.plot?.scenes[input.sceneIndex]?.description || "The story continues, with the heroes charting their own path.";

  return `
You are the narrative engine for a game called “Chronica: Infinite Stories” by Alberto Arce.
Your purpose is to generate fast-paced, engaging, and challenging narrative scenes.
The user's chosen language is '${input.lang}'. All output must be in this language.
The content must be family-friendly.

**Core Directives:**
1.  **React to the Last Action:** The user's last action was: "${input.lastChoice}". The "story" you generate next MUST be a direct and logical consequence of this action. This is the most important rule.
2.  **Be Direct and Action-Oriented:** Focus on creating immediate challenges. Introduce enemies, obstacles, and conflicts frequently. The narrative should be concise and to the point, avoiding lengthy descriptions.
3.  **Introduce Puzzles and Riddles:** Regularly include logical puzzles, riddles, or environmental challenges. When creating a puzzle, ensure some of the provided \`options\` are incorrect attempts at solving it. These incorrect options should result in a negative \`stateDelta\`, such as \`{"health": -10}\`, to represent a penalty.
4.  **Maintain Consistency:**
    -   **Characters:** Any characters introduced must remain consistent in their appearance, personality, and name.
    -   **Visuals:** Image prompts must maintain a style that is consistent with the story's theme and title.

**Story So Far (Summary):**
${summary}

**Party State:**
- Players: ${JSON.stringify(input.players.map(p => ({name: p.name, race: p.race, class: p.class, isAlive: p.isAlive})))}. You MUST use the characters' races and classes to inform the narrative.
- Current Turn: It is ${input.players[input.turn].name}'s turn to act.
- Last Choice: ${input.lastChoice || 'None'}
- Story Theme: The story is titled "${input.storyTitle}". The entire narrative must strictly adhere to this theme and the overall plot.
- Known World State: Use these details for consistency. ${JSON.stringify(input.worldState)}
- **Current Scene Goal:** The current objective for the heroes is: "${currentSceneGoal}". Your generated scene must be a step towards accomplishing this goal. As the story progresses (higher scene index out of total scenes), the narrative should build towards a climax and conclusion based on the overall plot.
- **Custom Action Integration:** If the "Last Choice" was a custom action written by the player, you MUST make that action the central focus of the generated "story" text. The narrative should describe the outcome of that specific action. The "imagePrompt" should also visually represent this custom action.

**Your Task:**
Generate the NEXT scene that logically follows the "Last Choice" and moves the story towards the "Current Scene Goal". Update the world state with any new characters, locations, or key items.
Return EXACTLY a JSON object with the following structure (no markdown, no extra keys):
{
  "story": "A brief, direct narrative (max 80 words) in '${input.lang}'.",
  "options": [
    {"text": "An action-oriented option in '${input.lang}'...", "isRisky": false, "stateDelta": {"risk": 5}},
    {"text": "A risky option that requires a dice roll...", "isRisky": true, "stateDelta": {"risk": 20, "health": -5}},
    {"text": "A puzzle-solving or investigative option...", "isRisky": false, "stateDelta": {"mana": -5}}
  ],
  "imagePrompt": "A short, vivid scene description for illustration, using details from the world state.",
  "sceneTags": ["comma-free", "single", "word", "tags"],
  "stateDelta": {
    "worldState": { "new_character_name": "description", "new_location_name": "description" }
  },
  "ui": { "title": "Short scene title in '${input.lang}'", "toast": "1 short line reacting to last choice in '${input.lang}'" },
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
export async function generateScene(input, options = {}) {
  const history = input.history || [];
  const summary = await getSummary(history);

  const apiUrl = 'https://text.pollinations.ai/openai';
  const prompt = getPrompt(input, summary, options);
  const payload = { model: 'openai', messages: [{ role: 'user', content: prompt }] };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error(`API request failed with status ${response.status}`);
      if (options.isRiddleTurn) {
        return { acertijo: "The API failed. What is the answer to life, the universe, and everything?", opciones: [{texto: "42", correcta: true}, {texto: "24", correcta: false}, {texto: "Potato", correcta: false}] };
      }
      return fallbackScene;
    }

    const result = await response.json();
    const jsonResponseString = result.choices[0].message.content;
    const sceneOrRiddle = JSON.parse(jsonResponseString);

    // If it's a regular scene, ensure it has the credits.
    if (sceneOrRiddle.story) {
        sceneOrRiddle.credits = "Created by Alberto Arce.";
    }

    return sceneOrRiddle;

  } catch (error) {
    console.error("An error occurred while fetching or parsing the scene:", error);
    // If it was a riddle turn, we can't return a scene, so we return a simple riddle fallback.
    if (options.isRiddleTurn) {
        return {
            acertijo: "The API failed. What is the answer to life, the universe, and everything?",
            opciones: [{texto: "42", correcta: true}, {texto: "24", correcta: false}, {texto: "Potato", correcta: false}]
        };
    }
    return fallbackScene;
  }
}

const getPlotPrompt = (title, lang) => {
    return `
You are a master storyteller for the text-based RPG “Chronica: Infinite Stories”.
Your task is to generate a complete, original story plot based on a given title.
The story must have a clear beginning, a rising action, a climax, and a resolution.
The user's chosen language is '${lang}'. All output must be in this language.

**Story Title:** "${title}"

**Directives:**
1.  **Overall Summary:** Write a brief, one-paragraph summary of the entire story.
2.  **Act Structure:** Divide the story into 5 to 10 "scenes".
3.  **Scene Content:** For each scene, provide a 'title' and a 'description'. The description should set the stage for that part of the story.
4.  **JSON Format:** Return EXACTLY a JSON object with the following structure (no markdown, no extra keys):
{
  "title": "The Full Title of the Story",
  "summary": "The one-paragraph summary of the story.",
  "scenes": [
    {
      "title": "Scene 1 Title",
      "description": "A description of what happens in the first scene."
    },
    {
      "title": "Scene 2 Title",
      "description": "A description of the next part of the story."
    }
  ]
}
`;
};

export async function generatePlot(title, lang) {
    const prompt = getPlotPrompt(title, lang);
    const payload = { model: 'openai', messages: [{ role: 'user', content: prompt }] };
    const apiUrl = 'https://text.pollinations.ai/openai';

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error(`Plot generation API failed with status ${response.status}`);
            throw new Error('API failed');
        }

        const result = await response.json();
        const jsonResponseString = result.choices[0].message.content;
        return JSON.parse(jsonResponseString);

    } catch (error) {
        console.error("Failed to generate plot, using fallback:", error);
        return {
            title: title,
            summary: "An unexpected error occurred while trying to generate your story. You find yourself on a generic adventure.",
            scenes: [
                { title: "The Beginning", description: "The adventure starts here." },
                { title: "The Middle", description: "The plot thickens." },
                { title: "The End", description: "The story concludes." }
            ]
        };
    }
}
