import { generateScene } from './engine.js';
import { initDB, createNewStory, getAllStories, saveEvent, getHistory } from './database.js';

function typewriter(element, text, speed = 50, callback = () => {}) {
  let i = 0;
  element.innerHTML = '';
  const timer = setInterval(() => {
    if (i < text.length) {
      element.innerHTML += text.charAt(i);
      i++;
    } else {
      clearInterval(timer);
      callback();
    }
  }, speed);
}

function renderError(message) {
    const appDiv = document.getElementById('app');
    if (appDiv) {
        appDiv.innerHTML = `<p style="color: red;">Error: ${message}</p>`;
    }
}

// --- Global Game State ---
let gameState = {};
let timerInterval;
let currentStoryId = null;

function applyStateDelta(delta) {
  if (!delta) return;

  // Apply numeric changes (health, mana, risk)
  for (const key of ['health', 'mana', 'risk']) {
    if (typeof delta[key] === 'number') {
      gameState.sessionState[key] = (gameState.sessionState[key] || 0) + delta[key];
    }
  }
  // Clamp values
  if (gameState.sessionState.health < 0) gameState.sessionState.health = 0;
  if (gameState.sessionState.health > 100) gameState.sessionState.health = 100;
  // ... other clamps as needed

  // Apply inventory changes
  if (delta.inventory) {
    for (const [item, quantity] of Object.entries(delta.inventory)) {
      gameState.sessionState.inventory[item] = (gameState.sessionState.inventory[item] || 0) + quantity;
      if (gameState.sessionState.inventory[item] <= 0) {
        delete gameState.sessionState.inventory[item];
      }
    }
  }
}

function startTimer() {
  const timerElement = document.getElementById('timer');
  if (!timerElement) return;

  let seconds = 0;
  timerInterval = setInterval(() => {
    seconds++;
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    timerElement.textContent = `${mins}:${secs}`;
  }, 1000);
}

function renderSidePanel() {
  const panel = document.getElementById('side-panel');
  if (!panel || !gameState.sessionState) return;

  const { health, mana, risk, inventory } = gameState.sessionState;

  const inventoryItems = Object.entries(inventory).map(([item, quantity]) => `<li>${item}: ${quantity}</li>`).join('');

  panel.innerHTML = `
    <h3>Stats</h3>
    <div class="stat-bar-container">
      <label>Health</label>
      <div class="stat-bar health-bar" style="width: ${health}%;"></div>
      <span>${health}/100</span>
    </div>
    <div class="stat-bar-container">
      <label>Mana</label>
      <div class="stat-bar mana-bar" style="width: ${mana}%;"></div>
      <span>${mana}/100</span>
    </div>
    <div class="stat-bar-container">
      <label>Risk</label>
      <div class="stat-bar risk-bar" style="width: ${risk}%;"></div>
      <span>${risk}/100</span>
    </div>
    <h4>Inventory</h4>
    <ul>${inventoryItems || '<li>Empty</li>'}</ul>
  `;
}

function renderScene(scene) {
  const appDiv = document.getElementById('app');
  if (!appDiv) {
    console.error("Could not find #app element in the DOM.");
    return;
  }

  const optionsHtml = scene.options.map((option, index) => {
    return `<li><button class="option-button" data-index="${index}" data-is-risky="${option.isRisky || false}">${option.text}</button></li>`;
  }).join('');

  let backgroundStyle = '';
  const imageUrlBase = 'https://image.pollinations.ai/prompt';
  if (scene.imagePrompt) {
    const fullUrl = `${imageUrlBase}/${encodeURIComponent(scene.imagePrompt)}`;
    backgroundStyle = `style="background-image: url('${fullUrl}')"`;
  }

  appDiv.innerHTML = `
    <div class="scene-background" ${backgroundStyle}></div>
    <div class="scene-overlay"></div>

    <div id="subtitle-container">
        <div id="options-container">
            <ul>${optionsHtml}</ul>
            <div id="custom-option-container">
                <input type="text" id="custom-option-input" placeholder="Or type your own action...">
                <button id="custom-option-submit">Submit</button>
            </div>
        </div>
        <p id="story-text"></p>
    </div>
  `;

  const storyElement = document.getElementById('story-text');
  const optionsContainer = document.getElementById('options-container');

  if (storyElement && optionsContainer) {
    typewriter(storyElement, scene.story, 50, () => {
      optionsContainer.classList.add('visible');
    });
  }

  // Add event listeners after a short delay to ensure elements are in the DOM
  setTimeout(() => {
    // Event listeners for the generated option buttons
    document.querySelectorAll('.option-button').forEach(button => {
      button.addEventListener('click', (event) => {
        const selectedOptionText = event.target.innerText;
        const isRisky = event.target.dataset.isRisky === 'true';

        if (isRisky) {
          handleRiskyChoice(selectedOptionText, scene.stateDelta, scene.story);
        } else {
          advanceToNextScene(selectedOptionText, scene.stateDelta, scene.story);
        }
      });
    });

    // Event listener for the custom text input
    const customInput = document.getElementById('custom-option-input');
    const customSubmit = document.getElementById('custom-option-submit');
    if (customSubmit && customInput) {
      customSubmit.addEventListener('click', () => {
        const customChoice = customInput.value;
        if (customChoice.trim() !== '') {
          advanceToNextScene(customChoice, scene.stateDelta, scene.story);
        }
      });
    }
  }, 0);
}

async function handleRiskyChoice(actionText, stateDelta, storyText) {
  const modal = document.getElementById('dice-roll-modal');
  const resultDiv = document.getElementById('dice-result');

  modal.classList.remove('hidden');
  resultDiv.classList.remove('visible');
  resultDiv.innerText = '';

  // Simulate roll time
  await new Promise(resolve => setTimeout(resolve, 2500));

  const roll = Math.floor(Math.random() * 20) + 1;
  resultDiv.innerText = roll;
  resultDiv.classList.add('visible');

  // Time for player to see the result
  await new Promise(resolve => setTimeout(resolve, 2000));

  modal.classList.add('hidden');

  const choice = { action: actionText, roll: roll };
  advanceToNextScene(choice, stateDelta, storyText);
}

async function advanceToNextScene(choice, stateDelta, storyText = '') {
  console.log(`Player chose: ${choice}`);
  document.getElementById('app').innerHTML = '<p>Loading next scene...</p>';

  applyStateDelta(stateDelta);
  renderSidePanel();

  gameState.sessionState.turn = (gameState.sessionState.turn || 0) + 1;
  gameState.lastChoice = choice;

  // Save the event that just concluded
  await saveEvent(currentStoryId, {
    turn: gameState.sessionState.turn,
    choice: choice,
    stateDelta: stateDelta,
    story: storyText
  });

  const history = await getHistory(currentStoryId, 5);
  gameState.sessionState.history = history;

  if (gameState.sessionState.risk >= 100) {
    gameState.sessionState.risk = 0;
    handleRiskyChoice("A forced consequence of mounting risk!", {});
    return;
  }

  try {
    const nextScene = await generateScene(gameState);
    renderScene(nextScene);
  } catch (error) {
    console.error("Failed to generate next scene:", error);
    renderError("Could not continue your adventure.");
  }
}

async function startGame(storyId, lang) {
  console.log(`Starting game for story ${storyId} with language: ${lang}`);
  currentStoryId = storyId;
  startTimer();
  document.getElementById('app').style.display = 'flex';

  gameState = {
    lang: lang,
    playerProfile: { name: 'Player', lang: lang },
    sessionState: { health: 100, mana: 100, risk: 0, inventory: {}, flags: {}, worldState: {}, turn: 0 },
    lastChoice: null
  };

  const history = await getHistory(currentStoryId, Infinity);
  if (history.length > 0) {
    console.log('Reconstructing state from history...');
    history.reverse().forEach(event => applyStateDelta(event.stateDelta));
  }

  renderSidePanel();
  advanceToNextScene("The story begins.", {}, "Welcome to your story!");
}

function showLanguageSelector() {
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('language-selector').classList.remove('hidden');
}

async function showStartScreen(lang) {
  const startScreen = document.getElementById('start-screen');
  const langSelector = document.getElementById('language-selector');

  // Fetch i18n data to translate the start screen
  try {
    const response = await fetch(`src/i18n/${lang}.json`);
    const i18n = await response.json();
    const texts = i18n.start_screen;

    startScreen.querySelector('h1').textContent = texts.title;
    document.getElementById('new-story-btn').textContent = texts.new_story;
    document.getElementById('load-story-btn').textContent = texts.load_story;
    startScreen.querySelector('#saved-stories-container h3').textContent = texts.saved_stories;
  } catch (e) {
    console.error("Could not load translations for start screen", e);
  }

  langSelector.classList.add('hidden');
  startScreen.classList.remove('hidden');

  // Set up listeners now that the screen is visible and translated
  document.getElementById('new-story-btn').addEventListener('click', () => handleNewStory(lang));
  document.getElementById('load-story-btn').addEventListener('click', () => handleLoadStory(lang));
}

async function handleNewStory(lang) {
  const dialog = document.getElementById('new-story-dialog');
  const input = document.getElementById('new-story-title-input');
  const submitBtn = document.getElementById('new-story-submit-btn');

  dialog.classList.remove('hidden');
  document.getElementById('start-screen').classList.add('hidden');

  submitBtn.onclick = async () => {
    const title = input.value;
    if (title.trim()) {
      dialog.classList.add('hidden');
      currentStoryId = await createNewStory(title);
      startGame(currentStoryId, lang);
    }
  };
}

async function handleLoadStory(lang) {
  const stories = await getAllStories();
  const list = document.getElementById('saved-stories-list');
  const container = document.getElementById('saved-stories-container');
  list.innerHTML = '';
  if (stories.length === 0) {
    list.innerHTML = '<li>No saved stories found.</li>';
  } else {
    stories.forEach(story => {
      const li = document.createElement('li');
      li.textContent = `${story.title} (Last played: ${new Date(story.last_played).toLocaleString()})`;
      li.dataset.id = story.id;
      li.addEventListener('click', () => {
        startGame(story.id, lang);
      });
      list.appendChild(li);
    });
  }
  container.classList.remove('hidden');
}

async function main() {
  await initDB();

  // Language Selector Logic
  document.querySelectorAll('.flag-button').forEach(button => {
    button.addEventListener('click', () => {
      const lang = button.dataset.lang;
      if (document.fullscreenEnabled) {
        document.documentElement.requestFullscreen().catch(err => console.warn(err));
      }
      showStartScreen(lang);
    });
  });

  // Side Panel Logic
  const menuButton = document.getElementById('menu-button');
  const sidePanel = document.getElementById('side-panel');
  if(menuButton && sidePanel) {
    menuButton.addEventListener('click', () => {
      renderSidePanel();
      sidePanel.classList.toggle('visible');
    });
  }
}

main();
