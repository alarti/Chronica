// src/tts.js

class TTSManager {
    constructor() {
        this.synth = window.speechSynthesis;
        this.voices = [];
        this.enabled = true; // Enabled by default, can be toggled
        this.speaking = false;
        this.currentQueue = [];
        this.currentUtterance = null;

        // Bind methods
        this.loadVoices = this.loadVoices.bind(this);
        this.playNextInQueue = this.playNextInQueue.bind(this);

        this.loadVoices();
        if (this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = this.loadVoices;
        }
    }

    loadVoices() {
        this.voices = this.synth.getVoices();
        if (this.voices.length > 0) {
            console.log("TTS voices loaded:", this.voices.length);
        }
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.stop();
        }
    }

    stop() {
        this.speaking = false;
        this.currentQueue = []; // Clear the queue
        if (this.currentUtterance) {
            this.currentUtterance.onend = null; // Prevent onend from firing after manual stop
        }
        this.synth.cancel();
    }

    findVoice(voicePrefs) {
        if (this.voices.length === 0) {
            // Voices might not be loaded yet, try again
            this.loadVoices();
        }
        if (this.voices.length === 0) {
            console.warn("No voices loaded yet.");
            return null;
        }

        // 1. Try to find exact accent match
        let bestMatch = this.voices.find(v => v.lang === voicePrefs.accent);
        if (bestMatch) return bestMatch;

        // 2. Fallback to language match
        const lang = voicePrefs.accent.split('-')[0];
        bestMatch = this.voices.find(v => v.lang.startsWith(lang));
        if (bestMatch) return bestMatch;

        // 3. Fallback to any English voice as a last resort
        bestMatch = this.voices.find(v => v.lang.startsWith('en'));
        if (bestMatch) return bestMatch;

        // 4. Fallback to the first available voice
        return this.voices[0] || null;
    }

    playScene(narrative, onBlockStart, onSceneEnd) {
        if (!this.enabled || !narrative || narrative.length === 0) {
            if (onSceneEnd) onSceneEnd();
            return;
        }
        this.stop();
        this.currentQueue = narrative.map((block, index) => ({...block, index}));
        this.speaking = true;
        this.onBlockStart = onBlockStart;
        this.onSceneEnd = onSceneEnd;
        this.playNextInQueue();
    }

    playNextInQueue() {
        if (!this.speaking || this.currentQueue.length === 0) {
            this.speaking = false;
            if (this.onSceneEnd) this.onSceneEnd();
            return;
        }

        const block = this.currentQueue.shift();
        const { text, voice: voicePrefs, urgent, style } = block;

        if (this.onBlockStart) {
            this.onBlockStart(block);
        }

        const utterance = new SpeechSynthesisUtterance(text);
        this.currentUtterance = utterance;

        utterance.voice = this.findVoice(voicePrefs);

        // Set defaults
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Apply style modifications
        if (urgent) {
            utterance.rate = 1.25;
        }

        if (style) {
            switch (style) {
                case 'calm':
                    utterance.rate *= 0.9;
                    break;
                case 'urgent':
                    utterance.rate *= 1.25;
                    utterance.pitch = 1.1;
                    break;
                case 'whisper':
                    utterance.volume *= 0.7;
                    utterance.pitch = 0.9;
                    utterance.rate *= 0.95;
                    break;
                case 'epic':
                    utterance.rate *= 0.85;
                    utterance.pitch = 0.9;
                    break;
                case 'dramatic':
                    utterance.rate *= 0.9;
                    utterance.pitch = 1.1;
                    break;
            }
        }

        utterance.onend = () => {
            this.currentUtterance = null;
            setTimeout(this.playNextInQueue, 250); // Brief pause between lines
        };

        utterance.onerror = (event) => {
            console.error('SpeechSynthesisUtterance.onerror', event);
            this.currentUtterance = null;
            // Continue with the queue even if one block fails
            this.playNextInQueue();
        };

        this.synth.speak(utterance);
    }
}

// Export a singleton instance
const ttsManager = new TTSManager();
export default ttsManager;
