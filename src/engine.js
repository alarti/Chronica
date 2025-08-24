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
  "language": "en",
  "scene_id": "fallback-awakening",
  "title": "The Awakening",
  "narrative": [
    {
      "speaker": "narrator",
      "text": "You awaken in a dimly lit chamber, the air thick with the smell of dust and old stone. A single torch flickers on a nearby wall, casting long shadows that dance like phantoms.",
      "voice": { "role": "narrator", "gender": "neutral", "age": "adult", "style": "mysterious", "accent": "en-US" },
      "sentiment": "tension",
      "urgent": false
    },
    {
        "speaker": "narrator",
        "text": "You don't remember how you got here. Three paths lie before you: a heavy oak door, a narrow stone staircase leading down, and a small, dark crevice in the wall.",
        "voice": { "role": "narrator", "gender": "neutral", "age": "adult", "style": "mysterious", "accent": "en-US" },
        "sentiment": "asombro",
        "urgent": false
    }
  ],
  "characters": [],
  "riddle": { "present": false, "prompt": "", "answer_hint": "" },
  "choices": [
    { "id": "A", "text": "Try to open the heavy oak door." },
    { "id": "B", "text": "Descend the narrow stone staircase." },
    { "id": "C", "text": "Investigate the dark crevice." }
  ],
  "image_prompt": "A mysterious, torch-lit stone chamber with a single flickering torch on the wall, revealing three potential paths: a large wooden door, a dark staircase, and a narrow crack in the wall.",
  "timers": { "suggested_ms_per_block": 4500, "accelerate_if_urgent_factor": 0.8 },
  "meta": {
    "round": 1,
    "mode": "solo",
    "players": ["Player"],
    "story_tags": ["dungeon", "start", "mystery"],
    "safety": { "age_rating": "PG-13", "content_flags": ["violence-mild"] }
  }
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
    const currentPlayer = input.players[input.turn];
    const characterSlug = (name) => name.toLowerCase().replace(/\s+/g, '-');
    const charactersForPrompt = input.players.map(p => ({
        id: `personaje:${characterSlug(p.name)}`,
        display_name: p.name,
        voice: { role: 'hero', gender: 'neutral', age: 'adult', style: 'neutral', accent: 'auto' },
        traits: [p.race, p.class, ...(p.isAlive ? [] : ['defeated'])]
    }));

    return `
You are a master of puzzles and riddles for the RPG “Chronica: Infinite Stories”.
Your task is to generate a single, clever, and UNIQUE riddle or puzzle for the current player, and wrap it in the standard scene JSON format.

**Current Player:** ${currentPlayer.name}
**Story Theme:** "${input.storyTitle}"
**Language:** '${input.lang}'
${usedRiddlesText}

**Directives:**
1.  Create a single riddle and three possible answers (one correct).
2.  Embed this riddle inside a complete scene object.
3.  The \`narrative\` should introduce the riddle.
4.  The \`riddle\` object's "present" field must be true.
5.  The \`choices\` should be the possible answers to the riddle.
6.  Return EXACTLY a JSON object following the main schema.

{
  "language": "${input.lang}",
  "scene_id": "riddle-scene-${input.round}",
  "title": "A Challenge Appears",
  "narrative": [{
    "speaker": "narrator",
    "text": "Suddenly, a mysterious voice echoes in your mind, presenting a challenge.",
    "voice": { "role": "narrator", "gender": "neutral", "age": "senior", "style": "mysterious", "accent": "${input.lang === 'en' ? 'en-GB' : input.lang + '-' + input.lang.toUpperCase()}" },
    "sentiment": "asombro",
    "urgent": false
  }],
  "characters": ${JSON.stringify(charactersForPrompt)},
  "riddle": {
    "present": true,
    "prompt": "The text of the riddle goes here.",
    "answer_hint": "A brief hint for the riddle's answer."
  },
  "choices": [
    { "id": "A", "text": "A plausible but incorrect answer.", "isCorrect": false },
    { "id": "B", "text": "The correct answer.", "isCorrect": true },
    { "id": "C", "text": "Another incorrect answer.", "isCorrect": false }
  ],
  "image_prompt": "A mysterious scene with a glowing rune or an ancient talking statue posing a riddle.",
  "timers": { "suggested_ms_per_block": 4500, "accelerate_if_urgent_factor": 0.8 },
  "meta": {
    "round": ${input.round},
    "mode": "${input.players.length > 1 ? 'multiplayer' : 'solo'}",
    "players": ${JSON.stringify(input.players.map(p => p.name))},
    "story_tags": ["riddle", "puzzle"],
    "safety": { "age_rating": "PG-13", "content_flags": [] }
  }
}
`;
};

const getFirstScenePrompt = (input) => {
    const plot = input.plot;
    const characterSlug = (name) => name.toLowerCase().replace(/\s+/g, '-');
    const charactersForPrompt = input.players.map(p => ({
        id: `personaje:${characterSlug(p.name)}`,
        display_name: p.name,
        voice: { role: 'hero', gender: 'neutral', age: 'adult', style: 'neutral', accent: 'auto' },
        traits: [p.race, p.class, p.description]
    }));

    return `
You are the master storyteller for the text-based RPG “Chronica: Infinite Stories”.
Your task is to create a compelling introductory "trailer" for the story, formatted for TTS.

**Language:** ${input.lang}
**Story Title:** "${plot.title}"
**Overall Plot Summary:** ${plot.summary}
**Characters:** ${JSON.stringify(charactersForPrompt)}

**Directives:**
1.  **Narrative Structure:** Create a sequence of narrative blocks for the "narrative" array.
2.  **Scene Setting:** The first 2-3 blocks should set the mood and describe the world based on the Plot Summary and Title. Use the "narrator" speaker.
3.  **Character Introduction:** After setting the scene, create one dedicated block for EACH character, introducing them by name and weaving in their description. Use "narrator" as the speaker.
4.  **Inciting Incident:** The final block should describe the first challenge, aligning with the first scene's goal: "${plot.scenes[0].description}".
5.  **Choices:** Provide three clear, action-oriented choices for the first player, ${input.players[0].name}.
6.  **Return JSON:** Return EXACTLY a JSON object following the main schema.

{
  "language": "${input.lang}",
  "scene_id": "introduction",
  "title": "${plot.title}",
  "narrative": [
    {
      "speaker": "narrator",
      "text": "A paragraph setting the scene (max 240 chars)...",
      "voice": { "role": "narrator", "gender": "neutral", "age": "adult", "style": "epic", "accent": "${input.lang === 'en' ? 'en-GB' : input.lang + '-' + input.lang.toUpperCase()}" },
      "sentiment": "asombro",
      "urgent": false
    },
    {
      "speaker": "narrator",
      "text": "An introduction for ${input.players[0].name}, the ${input.players[0].race} ${input.players[0].class}...",
      "voice": { "role": "narrator", "gender": "neutral", "age": "adult", "style": "epic", "accent": "${input.lang === 'en' ? 'en-GB' : input.lang + '-' + input.lang.toUpperCase()}" },
      "sentiment": "determinacion",
      "urgent": false
    }
  ],
  "characters": ${JSON.stringify(charactersForPrompt)},
  "riddle": { "present": false, "prompt": "", "answer_hint": "" },
  "choices": [
    { "id": "A", "text": "First action option for ${input.players[0].name}..." },
    { "id": "B", "text": "Second action option..." },
    { "id": "C", "text": "Third action option..." }
  ],
  "image_prompt": "An epic, cinematic image representing the story's title and main theme.",
  "timers": { "suggested_ms_per_block": 5000, "accelerate_if_urgent_factor": 0.8 },
  "meta": {
    "round": 0,
    "mode": "${input.players.length > 1 ? 'multiplayer' : 'solo'}",
    "players": ${JSON.stringify(input.players.map(p => p.name))},
    "story_tags": ["introduction"],
    "safety": { "age_rating": "PG-13", "content_flags": [] }
  }
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
  const currentPlayer = input.players[input.turn];
  const characterSlug = (name) => name.toLowerCase().replace(/\s+/g, '-');

  const charactersForPrompt = input.players.map(p => ({
    id: `personaje:${characterSlug(p.name)}`,
    display_name: p.name,
    voice: { role: 'hero', gender: 'neutral', age: 'adult', style: 'neutral', accent: 'auto' },
    traits: [p.race, p.class, ...(p.isAlive ? [] : ['defeated'])]
  }));

  return `
You are the narrative engine for Chronica: Infinite Stories, designed for web-based Text-to-Speech (TTS) output.
Your response MUST be a single, valid JSON object that strictly adheres to the schema below. Do not include comments or any text outside the JSON.

**Core Directives:**
1.  **React to the Last Action:** The player's last action was: "${input.lastChoice}". The scene you generate MUST be a direct and logical consequence of this action.
2.  **TTS Segmentation:** The main narrative must be an array of blocks, each with a maximum of 240 characters, ready for continuous TTS playback.
3.  **Voice & Sentiment:** Assign a voice, sentiment, and urgency to every narrative block. Keep voices consistent for each character.
4.  **Current Player Focus:** It is ${currentPlayer.name}'s turn. The story and choices should focus on their perspective.

**Story So Far (Summary):**
${summary}

**Party State:**
- Characters: ${JSON.stringify(charactersForPrompt)}
- Current Turn: ${currentPlayer.name}
- Story Theme: "${input.storyTitle}"
- Language: '${input.lang}'
- Current Scene Goal: "${currentSceneGoal}"

**Your Task:**
Generate the NEXT scene. Return EXACTLY a JSON object with the following structure.

{
  "language": "${input.lang}",
  "scene_id": "a-kebab-case-scene-id-describing-the-scene",
  "title": "A short, evocative scene title in '${input.lang}'",
  "narrative": [
    {
      "speaker": "narrator",
      "text": "A short narrative block describing the consequences of the last action (max 240 chars).",
      "voice": { "role": "narrator", "gender": "neutral", "age": "adult", "style": "mysterious", "accent": "${input.lang === 'en' ? 'en-GB' : input.lang + '-' + input.lang.toUpperCase()}" },
      "sentiment": "tension",
      "urgent": false
    },
    {
      "speaker": "personaje:${characterSlug(currentPlayer.name)}",
      "text": "A line of dialogue from ${currentPlayer.name} reacting to the situation.",
      "voice": { "role": "hero", "gender": "neutral", "age": "adult", "style": "determined", "accent": "${input.lang === 'en' ? 'en-US' : input.lang + '-' + input.lang.toUpperCase()}" },
      "sentiment": "determinacion",
      "urgent": false
    }
  ],
  "characters": ${JSON.stringify(charactersForPrompt)},
  "riddle": { "present": false, "prompt": "", "answer_hint": "" },
  "choices": [
    { "id": "A", "text": "An action-oriented choice for ${currentPlayer.name}." },
    { "id": "B", "text": "A different, concise choice." },
    { "id": "C", "text": "A third option, possibly investigative or social." }
  ],
  "image_prompt": "A brief, visual prompt for an image generator, under 140 characters, matching the narrative.",
  "timers": { "suggested_ms_per_block": 4500, "accelerate_if_urgent_factor": 0.8 },
  "meta": {
    "round": ${input.round},
    "mode": "${input.players.length > 1 ? 'multiplayer' : 'solo'}",
    "players": ${JSON.stringify(input.players.map(p => p.name))},
    "story_tags": ["adventure", "dynamic"],
    "safety": { "age_rating": "PG-13", "content_flags": ["violence-mild", "no-sexual-content"] }
  }
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
      return fallbackScene;
    }

    const result = await response.json();
    const jsonResponseString = result.choices[0].message.content;

    // Attempt to parse the JSON, but be ready to catch errors.
    const scene = JSON.parse(jsonResponseString);

    // Basic validation to ensure the response is in the new format.
    if (!scene.narrative || !scene.choices) {
        console.error("API response is not in the expected TTS format. Using fallback.");
        return fallbackScene;
    }

    return scene;

  } catch (error) {
    console.error("An error occurred while fetching or parsing the scene:", error);
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
