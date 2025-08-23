import { generateScene } from './engine.js';
import { initDB, saveEvent, getHistory } from './database.js';

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
    <div id="timer">00:00</div>

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

async function handleRiskyChoice(actionText, stateDelta) {
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
  advanceToNextScene(choice, stateDelta);
}

  // Add event listeners after a short delay to ensure elements are in the DOM
  setTimeout(() => {
    // Event listeners for the generated option buttons
    document.querySelectorAll('.option-button').forEach(button => {
      button.addEventListener('click', (event) => {
        const selectedOptionText = event.target.innerText;
        const isRisky = event.target.dataset.isRisky === 'true';

        if (isRisky) {
          handleRiskyChoice(selectedOptionText, scene.stateDelta);
        } else {
          advanceToNextScene(selectedOptionText, scene.stateDelta);
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
          advanceToNextScene(customChoice, scene.stateDelta);
        }
      });
    }
  }, 0);
}

async function advanceToNextScene(choice, stateDelta) {
  console.log(`Player chose: ${choice}`);
  const appDiv = document.getElementById('app');
  appDiv.innerHTML = '<p>Loading next scene...</p>';

  // Update game state
  gameState.sessionState.turn = (gameState.sessionState.turn || 0) + 1;
  gameState.lastChoice = choice;

  // Save the current event
  await saveEvent({
    turn: gameState.sessionState.turn,
    choice: choice,
    stateDelta: stateDelta
  });

  // Get recent history to provide context to the AI
  const history = await getHistory(5);
  gameState.sessionState.history = history;

  try {
    const nextScene = await generateScene(gameState);
    console.log("Generated Scene:", nextScene);
    renderScene(nextScene);
  } catch (error) {
    console.error("Failed to generate the next scene:", error);
    renderError("Could not continue your adventure. Please try refreshing the page.");
  }
}

function startGame(lang) {
  console.log(`Starting game with language: ${lang}`);
  startTimer();
  const appDiv = document.getElementById('app');
  appDiv.style.display = 'block';

  gameState = {
    lang: lang,
    playerProfile: { name: 'Player', lang: lang },
    sessionState: {
      story: [],
      inventory: {},
      flags: {},
      worldState: {},
      turn: 0
    },
    lastChoice: null
  };

  // Initial scene generation is just like advancing to the next scene
  advanceToNextScene("The story begins.", {});
}

async function main() {
  await initDB();

  const selector = document.getElementById('language-selector');
  const buttons = document.querySelectorAll('.flag-button');

  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const lang = button.dataset.lang;

      // Enter fullscreen mode
      if (document.fullscreenEnabled) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
        });
      }

      selector.style.display = 'none';
      startGame(lang);
    });
  });
}

main();
