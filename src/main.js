import { generateScene } from './engine.js';
import { initDB, createNewStory, getAllStories, saveEvent, getHistory } from './database.js';

const SCREENS = ['language-selector', 'start-screen', 'new-story-dialog', 'app', 'end-screen'];

function showScreen(screenId) {
  SCREENS.forEach(id => {
    const screen = document.getElementById(id);
    if (screen) {
      screen.classList.add('hidden');
    }
  });

  const activeScreen = document.getElementById(screenId);
  if (activeScreen) {
    activeScreen.classList.remove('hidden');
  }
}

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

  const currentPlayer = gameState.players[gameState.turn];

  // Apply player-specific changes (health, mana)
  for (const key of ['health', 'mana']) {
    if (typeof delta[key] === 'number' && currentPlayer) {
      currentPlayer[key] = (currentPlayer[key] || 0) + delta[key];
    }
  }

  // Clamp player values
  if (currentPlayer) {
    if (currentPlayer.health < 0) currentPlayer.health = 0;
    if (currentPlayer.health > 100) currentPlayer.health = 100;
    if (currentPlayer.mana < 0) currentPlayer.mana = 0;
    if (currentPlayer.mana > 100) currentPlayer.mana = 100;
  }

  // Apply party-wide changes (risk)
  if (typeof delta.risk === 'number') {
      gameState.risk = (gameState.risk || 0) + delta.risk;
      if (gameState.risk < 0) gameState.risk = 0;
      if (gameState.risk > 100) gameState.risk = 100;
  }

  // Apply inventory changes (shared)
  if (delta.inventory) {
    if (!gameState.inventory) gameState.inventory = {};
    for (const [item, quantity] of Object.entries(delta.inventory)) {
      gameState.inventory[item] = (gameState.inventory[item] || 0) + quantity;
      if (gameState.inventory[item] <= 0) {
        delete gameState.inventory[item];
      }
    }
  }
}

async function getImageAsDataURL(url) {
    // This function is a bit tricky because of CORS policies on remote servers.
    // A direct fetch might be blocked. A simple approach is to hope it works,
    // but a more robust solution might need a CORS proxy if issues arise.
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error(`Failed to fetch image for PDF: ${url}`, error);
        return null;
    }
}

async function generatePDF() {
    const downloadBtn = document.getElementById('download-pdf-btn');
    downloadBtn.textContent = 'Generating PDF...';
    downloadBtn.disabled = true;

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const history = await getHistory(currentStoryId, Infinity);
        const stories = await getAllStories();
        const storyTitle = stories.find(s => s.id === currentStoryId)?.title || 'My Adventure';

        doc.setFontSize(22);
        doc.text(storyTitle, 10, 20);
        doc.setFontSize(12);

        let y = 40;
        const margin = 10;
        const pageHeight = doc.internal.pageSize.height;

        history.reverse(); // chronological order

        for (const event of history) {
            if (y > pageHeight - 20) { // Page break check
                doc.addPage();
                y = 20;
            }

            if (event.imagePrompt) {
                const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(event.imagePrompt)}`;
                const imageData = await getImageAsDataURL(imageUrl);
                if (imageData) {
                    const imgWidth = 150;
                    const imgHeight = (imgWidth / 16) * 9;
                    if (y > pageHeight - (imgHeight + 10)) {
                        doc.addPage();
                        y = 20;
                    }
                    doc.addImage(imageData, 'JPEG', margin, y, imgWidth, imgHeight);
                    y += imgHeight + 10;
                }
            }

            if (event.story) {
                const storyLines = doc.splitTextToSize(event.story, 180);
                doc.text(storyLines, margin, y);
                y += (storyLines.length * 7);
            }

            if (event.choice) {
                let choiceText = '> ';
                if (typeof event.choice === 'object' && event.choice.action) {
                    choiceText += `${event.choice.action} (Rolled: ${event.choice.roll})`;
                } else {
                    choiceText += event.choice;
                }
                doc.setFont(undefined, 'italic');
                doc.text(choiceText, margin, y);
                y += 7;
                doc.setFont(undefined, 'normal');
            }

            y += 10; // Spacing
        }

        doc.save(`${storyTitle.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
        console.error("Failed to generate PDF", err);
        alert("Could not generate PDF. See console for details.");
    } finally {
        downloadBtn.textContent = 'Download Story as PDF';
        downloadBtn.disabled = false;
    }
}

function endGame(reason) {
  console.log(`Game Over: ${reason}`);
  clearInterval(timerInterval);

  const endScreen = document.getElementById('end-screen');
  if (reason === 'time_up') {
    endScreen.querySelector('h2').textContent = "Time's Up!";
  }

  // Clear the final stats container for now, as its logic will be more complex
  const finalStatsContainer = document.getElementById('final-stats');
  finalStatsContainer.innerHTML = '';

  showScreen('end-screen');

  document.getElementById('restart-btn').onclick = () => {
    window.location.reload();
  };

  document.getElementById('download-pdf-btn').onclick = generatePDF;
}

function startTimer(durationInMinutes = 0) {
    const timerElement = document.getElementById('timer');
    if (!timerElement) return;

    if (timerInterval) clearInterval(timerInterval);

    if (durationInMinutes > 0) {
        // Countdown
        let totalSeconds = durationInMinutes * 60;

        const updateCountdown = () => {
            if (totalSeconds < 0) {
                clearInterval(timerInterval);
                endGame('time_up');
                return;
            }
            const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
            const secs = (totalSeconds % 60).toString().padStart(2, '0');
            timerElement.textContent = `${mins}:${secs}`;
            totalSeconds--;
        };

        updateCountdown(); // Initial display
        timerInterval = setInterval(updateCountdown, 1000);
    } else {
        // Count up (no limit)
        let totalSeconds = 0;
        timerElement.textContent = '00:00';
        timerInterval = setInterval(() => {
            totalSeconds++;
            const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
            const secs = (totalSeconds % 60).toString().padStart(2, '0');
            timerElement.textContent = `${mins}:${secs}`;
        }, 1000);
    }
}

function renderSidePanel() {
  const panel = document.getElementById('side-panel');
  if (!panel || !gameState.players) return;

  let playerStatsHtml = gameState.players.map(player => {
    if (!player.isAlive) {
        return `
        <div class="player-stats dead">
            <h4>${player.name} (Defeated)</h4>
        </div>`;
    }
    return `
    <div class="player-stats">
        <h4>${player.name}</h4>
        <div class="stat-bar-container">
          <label>Health</label>
          <div class="stat-bar health-bar" style="width: ${player.health}%;"></div>
          <span>${player.health}/100</span>
        </div>
        <div class="stat-bar-container">
          <label>Mana</label>
          <div class="stat-bar mana-bar" style="width: ${player.mana}%;"></div>
          <span>${player.mana}/100</span>
        </div>
    </div>
  `}).join('');

  const inventoryItems = Object.entries(gameState.inventory || {}).map(([item, quantity]) => `<li>${item}: ${quantity}</li>`).join('');

  panel.innerHTML = `
    <h3>Party Stats</h3>
    ${playerStatsHtml}
    <hr>
    <h4>Shared Inventory</h4>
    <ul>${inventoryItems || '<li>Empty</li>'}</ul>
    <hr>
    <h4>Risk Level</h4>
    <div class="stat-bar-container">
      <div class="stat-bar risk-bar" style="width: ${gameState.risk}%;"></div>
      <span>${gameState.risk}/100</span>
    </div>
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
          handleRiskyChoice(selectedOptionText, scene.stateDelta, scene.story, scene.imagePrompt);
        } else {
          advanceToNextScene(selectedOptionText, scene.stateDelta, scene.story, scene.imagePrompt);
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
          advanceToNextScene(customChoice, scene.stateDelta, scene.story, scene.imagePrompt);
        }
      });
    }
  }, 0);
}

async function handleRiskyChoice(actionText, stateDelta, storyText, imagePrompt) {
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
  advanceToNextScene(choice, stateDelta, storyText, imagePrompt);
}

async function advanceToNextScene(choice, stateDelta, storyText = '', imagePrompt = '') {
  console.log(`Player chose: ${choice}`);
  document.getElementById('app').innerHTML = '<p>Loading next scene...</p>';

  applyStateDelta(stateDelta);
  renderSidePanel();

  // Simple turn progression. This will be more complex later.
  gameState.turn = (gameState.turn + 1) % gameState.players.length;
  gameState.lastChoice = choice;

  // Save the event that just concluded
  await saveEvent(currentStoryId, {
    turn: gameState.turn, // Save the turn number
    choice: choice,
    stateDelta: stateDelta,
    story: storyText,
    imagePrompt: imagePrompt
  });

  const history = await getHistory(currentStoryId, 5);
  gameState.history = history; // Save history at the top level

  if (gameState.risk >= 100) {
    gameState.risk = 0;
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

async function startGame(storyId, lang, timeLimit = 0, playerNames = ['Player']) {
  console.log(`Starting game for story ${storyId} with lang: ${lang}, time: ${timeLimit}min, players: ${playerNames.join(', ')}`);
  currentStoryId = storyId;
  startTimer(timeLimit);
  showScreen('app');

  // Set up side panel listener now that the game is starting
  const menuButton = document.getElementById('menu-button');
  const sidePanel = document.getElementById('side-panel');
  if(menuButton && sidePanel) {
    menuButton.onclick = () => {
      renderSidePanel();
      sidePanel.classList.toggle('hidden');
      menuButton.classList.toggle('panel-open');
    };
  }

  const players = playerNames.map(name => ({
    name: name,
    health: 100,
    mana: 100,
    isAlive: true,
  }));

  gameState = {
    lang: lang,
    players: players,
    turn: 0, // Index for the current player
    risk: 0,
    inventory: {},
    flags: {},
    worldState: {},
    lastChoice: null
  };

  const history = await getHistory(currentStoryId, Infinity);
  if (history.length > 0) {
    console.log('Reconstructing state from history...');
    // Note: applyStateDelta will need to be multiplayer-aware.
    // For now, this might not work as expected until that is refactored.
    history.reverse().forEach(event => applyStateDelta(event.stateDelta));
  }

  renderSidePanel();
  advanceToNextScene("The story begins.", {}, "Welcome to your story!");
}

async function showStartScreen(lang) {
  // Fetch i18n data to translate the start screen
  try {
    const response = await fetch(`src/i18n/${lang}.json`);
    const i18n = await response.json();
    const texts = i18n.start_screen;

    document.getElementById('start-screen').querySelector('h1').textContent = texts.title;
    document.getElementById('new-story-btn').textContent = texts.new_story;
    document.getElementById('load-story-btn').textContent = texts.load_story;
    document.getElementById('start-screen').querySelector('#saved-stories-container h3').textContent = texts.saved_stories;
  } catch (e) {
    console.error("Could not load translations for start screen", e);
  }

  showScreen('start-screen');

  // Set up listeners now that the screen is visible and translated
  document.getElementById('new-story-btn').onclick = () => handleNewStory(lang);
  document.getElementById('load-story-btn').onclick = () => handleLoadStory(lang);
}

async function handleNewStory(lang) {
  showScreen('new-story-dialog');
  const input = document.getElementById('new-story-title-input');
  const submitBtn = document.getElementById('new-story-submit-btn');
  const playerCountSelector = document.getElementById('player-count');
  const playerNamesContainer = document.getElementById('player-names-container');

  const updatePlayerNameInputs = () => {
    const count = parseInt(playerCountSelector.value, 10);
    playerNamesContainer.innerHTML = ''; // Clear existing inputs
    for (let i = 1; i <= count; i++) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'player-name-input';
        input.placeholder = `Player ${i} Name`;
        playerNamesContainer.appendChild(input);
    }
  }

  playerCountSelector.addEventListener('change', updatePlayerNameInputs);
  updatePlayerNameInputs(); // Initial call

  submitBtn.onclick = async () => {
    const title = input.value;
    if (title.trim()) {
      const timeLimit = document.querySelector('input[name="time-limit"]:checked').value;

      const playerNameInputs = document.querySelectorAll('.player-name-input');
      const playerNames = Array.from(playerNameInputs).map(input => input.value || input.placeholder);
      console.log("Starting multiplayer game with players:", playerNames);

      // The playerNames array will be used in the next phase for AI character generation.
      currentStoryId = await createNewStory(title);
      startGame(currentStoryId, lang, parseInt(timeLimit, 10), playerNames);
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
        // Loaded stories are single player, no time limit
        startGame(story.id, lang, 0, ['Player']);
      });
      list.appendChild(li);
    });
  }
  container.classList.remove('hidden');
}

async function main() {
  await initDB();
  showScreen('language-selector'); // Start at the language selector

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

}

main();
