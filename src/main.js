import { generateScene, generateCharacters, generateEnding, generatePlot } from './engine.js';
import { initDB, createNewStory, getAllStories, saveEvent, getHistory, deleteStory, updateStory, getStory } from './database.js';

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

function showRiddleFeedback(isCorrect) {
    const feedbackDiv = document.getElementById('riddle-feedback');
    if (!feedbackDiv) return;

    feedbackDiv.textContent = isCorrect ? 'Superado' : 'Fallo';
    feedbackDiv.className = isCorrect ? 'success' : 'failure';

    feedbackDiv.classList.remove('hidden');

    setTimeout(() => {
        feedbackDiv.classList.add('hidden');
    }, 1000);
}

function applyStateDelta(delta) {
  if (!delta) return;

    // Merge world state
    if (delta.worldState) {
        Object.assign(gameState.worldState, delta.worldState);
    }

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

    if (currentPlayer.health <= 0) {
        currentPlayer.isAlive = false;
    }
  }

  // Check for party wipe
  const livingPlayers = gameState.players.filter(p => p.isAlive);
  if (livingPlayers.length === 0) {
      endGame('party_defeated');
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
                if (event.isEpilogue) {
                    doc.setFont(undefined, 'bold');
                    doc.text("Epilogue", margin, y);
                    y += 7;
                    doc.setFont(undefined, 'normal');
                }
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

async function endGame(reason) {
  console.log(`Game Over: ${reason}`);
  clearInterval(timerInterval);

  const endScreen = document.getElementById('end-screen');
  const endTitle = endScreen.querySelector('h2');
  const finalStatsContainer = document.getElementById('final-stats');

  if (reason === 'time_up') {
    endTitle.textContent = "Time's Up!";
  } else if (reason === 'party_defeated') {
    endTitle.textContent = "Your Party Has Been Defeated";
  }

  finalStatsContainer.innerHTML = `<p><i>Generating your epilogue...</i></p>`;
  showScreen('end-screen');

  const finalState = {
      reason: reason,
      storyTitle: gameState.storyTitle,
      players: gameState.players
  };
  const epilogue = await generateEnding(finalState, gameState.lang);
  finalStatsContainer.innerHTML = `<p>${epilogue}</p>`;

    // Save the epilogue as a final event
    await saveEvent(currentStoryId, {
        isEpilogue: true,
        story: epilogue
    });

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

function updateProgress() {
    const fill = document.getElementById('progress-bar-fill');
    const percentage = document.getElementById('progress-percentage');
    if (!fill || !percentage || !gameState.plot || !gameState.plot.scenes) return;

    const totalScenes = gameState.plot.scenes.length;
    const currentScene = gameState.sceneIndex;
    const progress = totalScenes > 0 ? Math.round((currentScene / totalScenes) * 100) : 0;

    fill.style.width = `${progress}%`;
    percentage.textContent = `${progress}%`;
}

function renderSidePanel() {
  updateProgress(); // Update progress bar every time side panel is rendered
  const panel = document.getElementById('side-panel');
  if (!panel || !gameState.players) return;

  const turnIndicator = document.getElementById('turn-indicator');
  if (turnIndicator) {
      const currentPlayer = gameState.players[gameState.turn];
      if (currentPlayer && currentPlayer.isAlive) {
        turnIndicator.textContent = `Turn: ${currentPlayer.name}`;
      } else {
        turnIndicator.textContent = 'Turn: ...';
      }
  }

  const roundCounter = document.getElementById('round-counter');
  if (roundCounter) {
      roundCounter.textContent = `Round: ${gameState.round || 0}`;
  }

  let playerStatsHtml = gameState.players.map((player, index) => {
    const isActive = index === gameState.turn;
    const activeClass = isActive ? 'active-player' : '';

    if (!player.isAlive) {
        return `
        <div class="player-stats dead">
            <h4>${player.name} (Defeated)</h4>
        </div>`;
    }
    return `
    <div class="player-stats ${activeClass}">
        <h4>${player.name} - <span class="player-class">${player.race} ${player.class}</span></h4>
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
  `;}).join('');

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

function renderRiddle(riddle) {
    gameState.usedRiddles.push(riddle.acertijo);
    const appDiv = document.getElementById('app');
    appDiv.innerHTML = `
    <div class="scene-overlay"></div>
    <div id="subtitle-container">
        <p id="story-text"></p>
        <div id="options-container" class="visible">
            <ul></ul>
        </div>
    </div>`;

    const riddleText = document.getElementById('story-text');
    typewriter(riddleText, riddle.acertijo);

    const optionsList = document.querySelector("#options-container ul");
    riddle.opciones.forEach(option => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.className = 'option-button';
        button.textContent = option.texto;
        button.onclick = () => {
            showRiddleFeedback(option.correcta);
            if (option.correcta) {
                advanceToNextScene("You solved the riddle correctly!", {mana: 15});
            } else {
                advanceToNextScene("You answered the riddle incorrectly and feel a sharp pain.", {health: -15});
            }
        };
        li.appendChild(button);
        optionsList.appendChild(li);
    });
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
    const currentPlayer = gameState.players[gameState.turn];
    const optionsList = document.querySelector("#options-container ul");

    if (optionsList && currentPlayer.isAlive) {
        const passTurnLi = document.createElement('li');
        const passTurnBtn = document.createElement('button');
        passTurnBtn.id = 'pass-turn-btn';
        passTurnBtn.innerHTML = 'Pass Turn (-10 Mana)';
        if (currentPlayer.mana < 10) {
            passTurnBtn.disabled = true;
            passTurnBtn.title = 'Not enough mana';
        }
        passTurnBtn.addEventListener('click', () => {
            if (currentPlayer.mana >= 10) {
                advanceToNextScene(
                    `${currentPlayer.name} takes a moment to rest and gather their thoughts.`,
                    { mana: -10 }
                );
            }
        });
        passTurnLi.appendChild(passTurnBtn);
        optionsList.appendChild(passTurnLi);
    }

    // Event listeners for the generated option buttons
    document.querySelectorAll('.option-button').forEach(button => {
      button.addEventListener('click', (event) => {
        const optionIndex = parseInt(event.target.dataset.index, 10);
        const chosenOption = scene.options[optionIndex];

        const selectedOptionText = chosenOption.text;
        const isRisky = chosenOption.isRisky || false;
        const stateDelta = chosenOption.stateDelta || {};

        if (isRisky) {
          handleRiskyChoice(selectedOptionText, stateDelta, scene.story, scene.imagePrompt);
        } else {
          advanceToNextScene(selectedOptionText, stateDelta, scene.story, scene.imagePrompt);
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
          // Custom inputs have no pre-defined state delta.
          advanceToNextScene(customChoice, {}, scene.story, scene.imagePrompt);
        }
      });
    }
  }, 0);
}

function advanceTurn() {
    if (!gameState.players || gameState.players.length === 0) return;

    const livingPlayers = gameState.players.filter(p => p.isAlive);
    if (livingPlayers.length === 0) {
        return; // Game over is handled elsewhere.
    }

    let nextTurn;
    let currentTurn = gameState.turn;

    do {
        currentTurn = (currentTurn + 1) % gameState.players.length;
        if (currentTurn === 0) { // A full round has passed
            gameState.round = (gameState.round || 0) + 1;
            console.log(`--- Round ${gameState.round} ---`);
        }
    } while (!gameState.players[currentTurn].isAlive);

    gameState.turn = currentTurn;
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

  // Grant mana on high rolls
  if (roll >= 18) {
      if (!stateDelta) stateDelta = {};
      stateDelta.mana = (stateDelta.mana || 0) + 10;
      console.log("Critical success! +10 Mana.");
  }

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
  updateProgress();

  // Advance the turn to the next living player
  advanceTurn();
  gameState.lastChoice = choice;
  gameState.sceneIndex++; // Move to the next scene in the plot

  // Save the event that just concluded
  await saveEvent(currentStoryId, {
    turn: gameState.turn, // Save the turn number
    choice: choice,
    stateDelta: stateDelta,
    story: storyText,
    imagePrompt: imagePrompt
  });

  // Save the entire game state
  await updateStory(currentStoryId, { gameState: gameState });

  const history = await getHistory(currentStoryId, 5);
  gameState.history = history; // Save history at the top level

  if (gameState.risk >= 100) {
    gameState.risk = 0;
    handleRiskyChoice("A forced consequence of mounting risk!", {});
    return;
  }

  try {
    // Check for special riddle turn
    const isRiddleTurn = gameState.round > 0 && (gameState.round % 3 === 0) && gameState.turn === 0;
    if (isRiddleTurn) {
        console.log("--- Generating a special riddle! ---");
    }

    const sceneOrRiddle = await generateScene(gameState, { isRiddleTurn });

    if (sceneOrRiddle.acertijo) {
        renderRiddle(sceneOrRiddle);
    } else {
        renderScene(sceneOrRiddle);
    }
  } catch (error) {
    console.error("Failed to generate next scene:", error);
    renderError("Could not continue your adventure.");
  }
}

async function startGame(storyId, initialGameState, timeLimit = 0) {
  console.log(`Starting game for story ${storyId}`);
  currentStoryId = storyId;
  gameState = initialGameState;

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

  renderSidePanel();

  // If this is a new game, the sceneIndex will be 0.
  if (gameState.sceneIndex === 0) {
      advanceToNextScene("The story begins.", {}, "Welcome to your story!");
  } else {
      // If loading, just render the current state and wait for player.
      // We can refetch the last scene from history if needed, or just show a generic message.
      document.getElementById('app').innerHTML = `<p>Continue your adventure, ${gameState.players[gameState.turn].name}!</p>`;
      // This part could be improved to re-render the last scene properly.
      // For now, we'll just show the side panel and let the player take their turn.
      // A full implementation would require re-rendering the last scene based on history.
  }
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
  };

  playerCountSelector.addEventListener('change', updatePlayerNameInputs);
  updatePlayerNameInputs(); // Initial call

  submitBtn.onclick = async () => {
    const title = input.value;
    if (title.trim()) {
        submitBtn.textContent = 'Generating...';
        submitBtn.disabled = true;
        try {
            const timeLimit = document.querySelector('input[name="time-limit"]:checked').value;
            const playerNameInputs = document.querySelectorAll('.player-name-input');
            const playerNames = Array.from(playerNameInputs).map(input => input.value.trim() || input.placeholder);

            // 1. Generate characters and plot in parallel
            const [characters, plot] = await Promise.all([
                generateCharacters(playerNames, title),
                generatePlot(title, lang)
            ]);

            // 2. Create initial game state
            const initialGameState = {
                lang: lang,
                storyTitle: title,
                plot: plot,
                sceneIndex: 0,
                players: characters.map(char => ({ ...char, health: 100, mana: 100, isAlive: true })),
                turn: 0,
                round: 0,
                risk: 0,
                inventory: {},
                flags: {},
                worldState: {},
                lastChoice: null,
                usedRiddles: []
            };

            // 3. Create the story in the database
            const newStoryId = await createNewStory(title, plot, initialGameState);

            // 4. Start the game
            startGame(newStoryId, initialGameState, parseInt(timeLimit, 10));

        } catch (error) {
            console.error("Failed to start new story:", error);
            renderError("Failed to generate the story. Please try again.");
        } finally {
            submitBtn.textContent = 'Begin';
            submitBtn.disabled = false;
        }
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

      const titleSpan = document.createElement('span');
      titleSpan.className = 'story-list-title';
      titleSpan.textContent = `${story.title} (Last played: ${new Date(story.last_played).toLocaleString()})`;
      titleSpan.onclick = async () => {
        const fullStory = await getStory(story.id);
        if (fullStory && fullStory.gameState) {
            startGame(fullStory.id, fullStory.gameState);
        } else {
            renderError(`Could not load story "${story.title}". It might be corrupted.`);
        }
      };

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'story-list-actions';

      const pdfBtn = document.createElement('button');
      pdfBtn.textContent = 'PDF';
      pdfBtn.onclick = async () => {
        currentStoryId = story.id; // Set the global story ID for PDF generation
        await generatePDF();
        currentStoryId = null; // Reset it
      };

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.className = 'delete-btn';
      deleteBtn.onclick = async () => {
        if (window.confirm(`Are you sure you want to delete "${story.title}"? This cannot be undone.`)) {
            await deleteStory(story.id);
            handleLoadStory(lang); // Refresh the list
        }
      };

      actionsDiv.appendChild(pdfBtn);
      actionsDiv.appendChild(deleteBtn);
      li.appendChild(titleSpan);
      li.appendChild(actionsDiv);
      list.appendChild(li);
    });
  }
  container.classList.remove('hidden');
}

async function main() {
  await initDB();
  showScreen('language-selector'); // Start at the language selector

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then(registration => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      }, err => {
        console.log('ServiceWorker registration failed: ', err);
      });
    });
  }

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
