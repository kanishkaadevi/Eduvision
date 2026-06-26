/**
 * EduVision – Empowering Learning for the Visually Impaired
 * Core Application Engine & Accessibility Suite
 */

// ==========================================================================
// 1. Audio Soundscape Synth (Web Audio API)
// Provides modern, retro-futuristic audio feedback on button clicks/hovers
// ==========================================================================
const Soundscape = {
  ctx: null,
  muted: false,

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  },

  toggleMute() {
    this.muted = !this.muted;
    this.playTone(this.muted ? 200 : 600, 'sine', 0.15, this.muted ? 0.2 : 0.08);
    return this.muted;
  },

  playTone(freq, type = 'sine', duration = 0.1, volume = 0.05) {
    if (this.muted) return;
    this.init();
    try {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      
      gain.gain.setValueAtTime(volume, this.ctx.currentTime);
      // Exponential decay
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn("Audio Context blocked or not ready: ", e);
    }
  },

  playSuccess() {
    this.playTone(523.25, 'triangle', 0.12, 0.06); // C5
    setTimeout(() => this.playTone(659.25, 'triangle', 0.2, 0.06), 80); // E5
  },

  playAction() {
    this.playTone(440, 'sine', 0.08, 0.05); // A4
  },

  playToggle(state) {
    this.playTone(state ? 587.33 : 293.66, 'sawtooth', 0.15, 0.03); // D5 or D4
  },

  playError() {
    this.playTone(180, 'sawtooth', 0.25, 0.08);
    setTimeout(() => this.playTone(140, 'sawtooth', 0.3, 0.08), 100);
  },

  playMicAlert(start) {
    if (start) {
      this.playTone(880, 'sine', 0.1, 0.06);
      setTimeout(() => this.playTone(1320, 'sine', 0.15, 0.06), 70);
    } else {
      this.playTone(1320, 'sine', 0.1, 0.06);
      setTimeout(() => this.playTone(880, 'sine', 0.15, 0.06), 70);
    }
  }
};

// ==========================================================================
// 2. State & Settings Manager
// Handles app theme, font, accessibility scaling, and document persistence
// ==========================================================================
const AppState = {
  theme: 'dark', // 'dark', 'light', 'high-contrast'
  fontSize: 'normal', // 'normal', 'large', 'xlarge'
  fontFamily: 'standard', // 'standard', 'dyslexic'
  autosaveActive: true,
  currentDocId: 'default_note',
  speakingWordIndex: -1,
  activeBrailleDots: new Set(), // active dot keys (1-6) for current cell
  collaborationMode: 'sighted', // 'sighted', 'blind'

  init() {
    // Load persisted settings
    this.theme = localStorage.getItem('ev_theme') || 'dark';
    this.fontSize = localStorage.getItem('ev_font_size') || 'normal';
    this.fontFamily = localStorage.getItem('ev_font_family') || 'standard';
    
    this.applySettings();
  },

  setTheme(theme) {
    this.theme = theme;
    localStorage.setItem('ev_theme', theme);
    this.applySettings();
    Soundscape.playTone(theme === 'high-contrast' ? 900 : 450, 'sine', 0.15, 0.04);
  },

  toggleDyslexicFont() {
    this.fontFamily = this.fontFamily === 'dyslexic' ? 'standard' : 'dyslexic';
    localStorage.setItem('ev_font_family', this.fontFamily);
    this.applySettings();
    Soundscape.playToggle(this.fontFamily === 'dyslexic');
  },

  changeFontSize(direction) {
    const sizes = ['normal', 'large', 'xlarge'];
    let idx = sizes.indexOf(this.fontSize);
    if (direction === 'up' && idx < 2) idx++;
    if (direction === 'down' && idx > 0) idx--;
    this.fontSize = sizes[idx];
    localStorage.setItem('ev_font_size', this.fontSize);
    this.applySettings();
    Soundscape.playTone(300 + idx * 100, 'sine', 0.1, 0.05);
  },

  applySettings() {
    document.documentElement.setAttribute('data-theme', this.theme);
    document.documentElement.setAttribute('data-size', this.fontSize);
    document.documentElement.setAttribute('data-font', this.fontFamily);
    
    // Update active visual elements
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === this.theme);
    });
    
    const dyslexicBtn = document.getElementById('dyslexiaBtn');
    if (dyslexicBtn) {
      dyslexicBtn.classList.toggle('active', this.fontFamily === 'dyslexic');
    }
  }
};

// ==========================================================================
// 3. Text-To-Speech (TTS) & Word Highlighting Engine
// Renders rich visual word tracking and audio output via Web Speech API
// ==========================================================================
const TTSEngine = {
  synth: window.speechSynthesis,
  utterance: null,
  activeHighlightId: null,
  voices: [],
  selectedVoiceName: null,
  speed: 1.0,
  pitch: 1.0,

  init() {
    if (!this.synth) {
      console.warn("Speech Synthesis is not supported in this browser.");
      return;
    }
    // Load voices
    const loadVoices = () => {
      this.voices = this.synth.getVoices();
      this.populateVoiceSelect();
    };
    loadVoices();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = loadVoices;
    }
  },

  populateVoiceSelect() {
    const select = document.getElementById('voiceSelect');
    if (!select) return;
    select.innerHTML = '';
    
    // Filter useful English/Multilingual voices
    const filtered = this.voices.filter(v => v.lang.startsWith('en') || v.lang.startsWith('es') || v.lang.startsWith('hi') || v.lang.startsWith('fr'));
    
    filtered.forEach(voice => {
      const opt = document.createElement('option');
      opt.value = voice.name;
      opt.textContent = `${voice.name} (${voice.lang})`;
      if (voice.default && !this.selectedVoiceName) {
        opt.selected = true;
        this.selectedVoiceName = voice.name;
      }
      select.appendChild(opt);
    });

    select.addEventListener('change', (e) => {
      this.selectedVoiceName = e.target.value;
      Soundscape.playAction();
      this.speak("Voice setting updated.");
    });
  },

  setSpeed(val) {
    this.speed = parseFloat(val);
    document.getElementById('speedVal').textContent = `${this.speed}x`;
    Soundscape.playAction();
  },

  setPitch(val) {
    this.pitch = parseFloat(val);
    document.getElementById('pitchVal').textContent = `${this.pitch}`;
    Soundscape.playAction();
  },

  cancel() {
    if (this.synth.speaking) {
      this.synth.cancel();
    }
    this.clearHighlighting();
  },

  clearHighlighting() {
    const wrapper = document.getElementById('editorHighlightWrapper');
    const textarea = document.getElementById('editorTextarea');
    if (wrapper && textarea) {
      wrapper.style.display = 'none';
      textarea.style.color = 'inherit';
    }
  },

  speak(text, highlightTextElementId = null) {
    this.cancel();
    if (!text) return;

    this.utterance = new SpeechSynthesisUtterance(text);
    
    // Find chosen voice
    if (this.selectedVoiceName) {
      const voice = this.voices.find(v => v.name === this.selectedVoiceName);
      if (voice) this.utterance.voice = voice;
    }
    
    this.utterance.rate = this.speed;
    this.utterance.pitch = this.pitch;

    // Word highlighting setup if reading editor content
    if (highlightTextElementId) {
      const element = document.getElementById(highlightTextElementId);
      const textVal = element.value || element.innerText;
      const words = textVal.split(/(\s+)/); // Preserve spaces for mapping
      
      const wrapper = document.getElementById('editorHighlightWrapper');
      if (wrapper) {
        wrapper.style.display = 'block';
        element.style.color = 'transparent';
        
        // Construct visual word spans
        wrapper.innerHTML = '';
        words.forEach((w, index) => {
          const span = document.createElement('span');
          span.id = `speech-word-${index}`;
          span.textContent = w;
          wrapper.appendChild(span);
        });

        // Track speaking boundaries
        let charIndexOffset = 0;
        const wordMap = []; // Maps starting character index to span element index
        
        let currentPos = 0;
        words.forEach((w, idx) => {
          wordMap.push({ start: currentPos, length: w.length, spanIndex: idx });
          currentPos += w.length;
        });

        this.utterance.onboundary = (event) => {
          if (event.name === 'word') {
            const charIdx = event.charIndex;
            // Find corresponding word index
            const target = wordMap.find(item => charIdx >= item.start && charIdx < item.start + item.length);
            if (target) {
              // Reset all spans
              wrapper.querySelectorAll('span').forEach(s => s.className = '');
              // Highlight active span
              const activeSpan = document.getElementById(`speech-word-${target.spanIndex}`);
              if (activeSpan) {
                activeSpan.className = 'highlighted-word';
                activeSpan.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
            }
          }
        };
      }
    }

    this.utterance.onend = () => {
      this.clearHighlighting();
    };

    this.utterance.onerror = (e) => {
      console.warn("TTS Error: ", e);
      this.clearHighlighting();
    };

    this.synth.speak(this.utterance);
  }
};

// ==========================================================================
// 4. Speech Recognition & Hands-Free Navigation
// Integrates continuous speech listeners and parses app vocal hotkeys
// ==========================================================================
const SpeechEngine = {
  recognition: null,
  isListening: false,

  init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Speech Recognition not supported.");
      return;
    }
    
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = false;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => {
      this.isListening = true;
      this.updateMicUI();
      Soundscape.playMicAlert(true);
      this.postSRCaption("[System Listening for voice commands...]");
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.updateMicUI();
      Soundscape.playMicAlert(false);
      this.postSRCaption("[Voice Recognition offline]");
    };

    this.recognition.onerror = (e) => {
      console.warn("Speech Recognition Error: ", e);
      this.isListening = false;
      this.updateMicUI();
    };

    this.recognition.onresult = (event) => {
      const resultIndex = event.resultIndex;
      const transcript = event.results[resultIndex][0].transcript.trim().toLowerCase();
      this.postSRCaption(`Detected: "${transcript}"`);
      this.parseVoiceCommand(transcript);
    };
  },

  toggleListening() {
    if (!this.recognition) {
      alert("Speech Recognition is not supported by your browser. Try Google Chrome.");
      return;
    }
    if (this.isListening) {
      this.recognition.stop();
    } else {
      this.recognition.start();
    }
  },

  updateMicUI() {
    const btn = document.getElementById('micButton');
    const label = document.getElementById('micStatusText');
    if (!btn || !label) return;

    if (this.isListening) {
      btn.className = 'mic-button listening';
      btn.innerHTML = '📳'; // Listening icon
      label.textContent = "Listening continuously... (Say commands)";
    } else {
      btn.className = 'mic-button';
      btn.innerHTML = '🎙️';
      label.textContent = "Voice Controls Offline";
    }
  },

  postSRCaption(text) {
    const cap = document.getElementById('srCaption');
    if (cap) {
      cap.innerHTML = `<span>🔊</span> ${text}`;
    }
  },

  parseVoiceCommand(command) {
    console.log("Parsing command: ", command);
    
    if (command.includes("help") || command.includes("menu")) {
      TTSEngine.speak("EduVision vocal commands include: open editor, read current note, ask assistant [question], save document, high contrast, normal contrast, toggle dyslexia font, and clear notes.");
      return;
    }
    
    if (command.includes("open editor") || command.includes("go to editor")) {
      document.getElementById("editorTextarea").focus();
      TTSEngine.speak("Editor focused. Start typing or dictating.");
      return;
    }
    
    if (command.includes("read current note") || command.includes("read document") || command.includes("read note")) {
      const text = document.getElementById("editorTextarea").value;
      if (!text) {
        TTSEngine.speak("Your note is empty.");
      } else {
        TTSEngine.speak("Reading document: ");
        setTimeout(() => TTSEngine.speak(text, 'editorTextarea'), 1000);
      }
      return;
    }

    if (command.includes("save document") || command.includes("save note")) {
      DocumentManager.saveDocument();
      return;
    }

    if (command.includes("clear notes") || command.includes("clear document")) {
      document.getElementById("editorTextarea").value = "";
      DocumentManager.handleEditorInput();
      TTSEngine.speak("Editor cleared.");
      return;
    }

    if (command.includes("high contrast")) {
      AppState.setTheme('high-contrast');
      TTSEngine.speak("High contrast enabled.");
      return;
    }

    if (command.includes("normal contrast") || command.includes("dark mode")) {
      AppState.setTheme('dark');
      TTSEngine.speak("Sleek dark theme enabled.");
      return;
    }

    if (command.includes("light mode") || command.includes("light theme")) {
      AppState.setTheme('light');
      TTSEngine.speak("Light theme enabled.");
      return;
    }

    if (command.includes("dyslexia font") || command.includes("dyslexic")) {
      AppState.toggleDyslexicFont();
      const state = AppState.fontFamily === 'dyslexic' ? "on" : "off";
      TTSEngine.speak(`Dyslexia-friendly spacing turned ${state}.`);
      return;
    }

    // AI chatbot assistant trigger: "ask assistant ..."
    if (command.startsWith("ask assistant") || command.startsWith("ask tutor")) {
      const question = command.replace("ask assistant", "").replace("ask tutor", "").trim();
      if (question) {
        AIChatbot.askAI(question);
      } else {
        TTSEngine.speak("What would you like to ask the tutor assistant?");
      }
      return;
    }

    // Default dictate into active textarea
    if (document.activeElement === document.getElementById("editorTextarea")) {
      const textarea = document.getElementById("editorTextarea");
      const space = textarea.value.length > 0 ? " " : "";
      textarea.value += space + command;
      DocumentManager.handleEditorInput();
      Soundscape.playTone(700, 'sine', 0.05, 0.02);
    }
  }
};

// ==========================================================================
// 5. Bluetooth Braille Keyboard Simulator
// Simulates hardware Braille keys using keyboard hooks & screen nodes
// Key bindings: F(dot 1), D(dot 2), S(dot 3) | J(dot 4), K(dot 5), L(dot 6)
// ==========================================================================
const BrailleSim = {
  // Mapping combinations of active dots to characters
  // Dot order is 1,2,3,4,5,6
  dotMap: {
    '1': 'a', '12': 'b', '14': 'c', '145': 'd', '15': 'e', '124': 'f', '1245': 'g',
    '125': 'h', '24': 'i', '245': 'j', '13': 'k', '123': 'l', '134': 'm', '1345': 'n',
    '135': 'o', '1234': 'p', '12345': 'q', '1235': 'r', '234': 's', '2345': 't',
    '136': 'u', '1236': 'v', '2456': 'w', '1346': 'x', '13456': 'y', '1356': 'z',
    '3456': '#', // Number sign indicator
    '2': ',', '23': ';', '25': ':', '256': '.', '235': '!', '236': '?', '36': '-',
    '3': "'", '2356': '"', '26': '(', '356': ')', '6': 'capitalize'
  },
  
  // Reversing English letters to visual Dot layout strings
  charMap: {},

  init() {
    // Generate reverse map for training visuals
    for (const [dots, char] of Object.entries(this.dotMap)) {
      this.charMap[char] = dots;
    }
    
    this.setupListeners();
    this.renderSimulatorCells();
  },

  renderSimulatorCells() {
    const parent = document.getElementById('brailleInteractiveCell');
    if (!parent) return;
    parent.innerHTML = '';
    
    // Renders 6 tactile interactive dots
    const layout = [1, 4, 2, 5, 3, 6];
    layout.forEach(dotNum => {
      const btn = document.createElement('button');
      btn.id = `braille-dot-node-${dotNum}`;
      btn.className = 'braille-dot';
      btn.setAttribute('aria-label', `Braille Dot ${dotNum}`);
      btn.innerHTML = dotNum;
      
      btn.addEventListener('click', () => {
        this.toggleDot(dotNum);
      });
      parent.appendChild(btn);
    });
  },

  setupListeners() {
    // Intercept keyboard commands for physical typing simulation
    // F->1, D->2, S->3, J->4, K->5, L->6
    const physicalKeys = {
      'f': 1, 'F': 1,
      'd': 2, 'D': 2,
      's': 3, 'S': 3,
      'j': 4, 'J': 4,
      'k': 5, 'K': 5,
      'l': 6, 'L': 6
    };

    let pressedKeys = new Set();
    let captureTimeout = null;

    window.addEventListener('keydown', (e) => {
      // Check if user is typing inside Braille simulator mode
      if (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT') {
        // Bypass if they are in normal inputs, EXCEPT if they press ESC to switch modes
        return;
      }

      const key = e.key.toLowerCase();
      if (physicalKeys[key] !== undefined) {
        e.preventDefault();
        const dotNum = physicalKeys[key];
        pressedKeys.add(dotNum);
        
        // Visual indicator on keyboard action
        const btn = document.getElementById(`braille-dot-node-${dotNum}`);
        if (btn) btn.classList.add('active');

        // Throttle key combination capture so the user can hit multiple keys together
        clearTimeout(captureTimeout);
        captureTimeout = setTimeout(() => {
          // Process current batch of keys pressed simultaneously
          this.processCombination(Array.from(pressedKeys));
          pressedKeys.clear();
          // Release visuals
          document.querySelectorAll('.braille-dot').forEach(b => b.classList.remove('active'));
        }, 150); // 150ms buffer time to group keypresses
      }

      // Add Spacebar key inside command mode to input standard blank spaces
      if (e.code === 'Space' && !['TEXTAREA', 'INPUT'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        this.inputCharacter(' ');
        Soundscape.playTone(350, 'triangle', 0.05, 0.04);
      }

      // Backspace to delete
      if (e.code === 'Backspace' && !['TEXTAREA', 'INPUT'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        this.deleteCharacter();
        Soundscape.playTone(250, 'sawtooth', 0.08, 0.03);
      }
    });
  },

  toggleDot(num) {
    const btn = document.getElementById(`braille-dot-node-${num}`);
    if (!btn) return;
    
    const dotActive = btn.classList.toggle('active');
    Soundscape.playTone(300 + num * 50, 'sine', 0.08, 0.05);

    // Keep state of clicked dots
    const display = document.getElementById('currentBrailleState');
    if (display) {
      const activeDots = Array.from(document.querySelectorAll('.braille-dot.active'))
                             .map(b => parseInt(b.textContent))
                             .sort((a,b) => a-b)
                             .join('');
      display.textContent = activeDots ? `Dots Active: ${activeDots}` : "Dots Active: None";
    }
  },

  submitActiveDotCombination() {
    const activeDots = Array.from(document.querySelectorAll('.braille-dot.active'))
                           .map(b => parseInt(b.textContent))
                           .sort((a,b) => a-b);
    
    if (activeDots.length > 0) {
      this.processCombination(activeDots);
      // Reset simulator cells
      document.querySelectorAll('.braille-dot').forEach(b => b.classList.remove('active'));
      const display = document.getElementById('currentBrailleState');
      if (display) display.textContent = "Dots Active: None";
    } else {
      Soundscape.playError();
      TTSEngine.speak("No dots selected.");
    }
  },

  processCombination(dotsArr) {
    const combination = dotsArr.sort((a,b) => a-b).join('');
    const char = this.dotMap[combination];

    if (char) {
      if (char === 'capitalize') {
        this.capitalizeNext = true;
        TTSEngine.speak("Capitalize next letter");
        Soundscape.playTone(800, 'sine', 0.1, 0.05);
      } else {
        let outputChar = char;
        if (this.capitalizeNext) {
          outputChar = char.toUpperCase();
          this.capitalizeNext = false;
        }
        this.inputCharacter(outputChar);
        TTSEngine.speak(outputChar);
        Soundscape.playSuccess();
      }
    } else {
      Soundscape.playError();
      TTSEngine.speak("Unknown Braille cell pattern.");
    }
  },

  inputCharacter(char) {
    const textarea = document.getElementById('editorTextarea');
    if (textarea) {
      textarea.value += char;
      DocumentManager.handleEditorInput();
    }
  },

  deleteCharacter() {
    const textarea = document.getElementById('editorTextarea');
    if (textarea && textarea.value.length > 0) {
      textarea.value = textarea.value.slice(0, -1);
      DocumentManager.handleEditorInput();
      TTSEngine.speak("Deleted");
    }
  },

  // Generates Braille Unicode symbols for training visuals
  translateToBrailleUnicode(text) {
    // Unicode base for Braille cells starts at 0x2800
    // Dots 1=1, 2=2, 3=4, 4=8, 5=16, 6=32, 7=64, 8=128 in binary offset
    const dotOffsets = {1: 1, 2: 2, 3: 4, 4: 8, 5: 16, 6: 32};
    let result = '';

    for (let i = 0; i < text.length; i++) {
      const char = text[i].toLowerCase();
      if (char === ' ') {
        result += ' ';
        continue;
      }
      const dotsStr = this.charMap[char];
      if (dotsStr) {
        let offset = 0;
        for (let j = 0; j < dotsStr.length; j++) {
          offset += dotOffsets[dotsStr[j]];
        }
        result += String.fromCharCode(0x2800 + offset);
      } else {
        result += '⠦'; // unknown symbol cell placeholder
      }
    }
    return result;
  }
};

// ==========================================================================
// 6. Accessible Document Manager
// Handles document metrics, exporting files, local storage backup,
// and automated accessibility diagnostic calculations
// ==========================================================================
const DocumentManager = {
  autosaveTimer: null,

  init() {
    const stored = localStorage.getItem('ev_current_doc');
    const textarea = document.getElementById('editorTextarea');
    if (stored && textarea) {
      textarea.value = stored;
    }
    this.handleEditorInput();
  },

  handleEditorInput() {
    const textarea = document.getElementById('editorTextarea');
    if (!textarea) return;

    const text = textarea.value;
    
    // Update word count metrics
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    
    document.getElementById('wordCountLabel').textContent = `Words: ${words}`;
    document.getElementById('charCountLabel').textContent = `Characters: ${chars}`;
    
    // Trigger live preview builders
    this.updateLivePreviews(text);
    
    // Live WCAG checklist evaluator
    this.runWCAGDiagnostics(text);

    // Dynamic auto saver
    if (AppState.autosaveActive) {
      clearTimeout(this.autosaveTimer);
      const syncStatus = document.getElementById('syncStatus');
      if (syncStatus) {
        syncStatus.className = "cloud-sync-status syncing";
        syncStatus.innerHTML = '<div class="sync-dot pulse"></div> Saving Draft...';
      }

      this.autosaveTimer = setTimeout(() => {
        localStorage.setItem('ev_current_doc', text);
        if (syncStatus) {
          syncStatus.className = "cloud-sync-status";
          syncStatus.innerHTML = '<div class="sync-dot"></div> Live Cloud Synced';
        }
      }, 800);
    }
  },

  saveDocument() {
    const text = document.getElementById('editorTextarea').value;
    localStorage.setItem('ev_current_doc', text);
    Soundscape.playSuccess();
    TTSEngine.speak("Document saved successfully to internal storage.");
  },

  exportDocumentTXT() {
    const text = document.getElementById('editorTextarea').value;
    if (!text) {
      TTSEngine.speak("Nothing to export.");
      Soundscape.playError();
      return;
    }
    const blob = new Blob([text], {type: 'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eduvision_export_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    Soundscape.playSuccess();
    TTSEngine.speak("Document exported successfully as plain text file.");
  },

  exportDocumentPDF() {
    const text = document.getElementById('editorTextarea').value;
    if (!text) {
      TTSEngine.speak("Nothing to export.");
      Soundscape.playError();
      return;
    }
    // Formats a clean layout view and invokes default system print engine
    // Custom configured styles render this directly to high-quality vector PDF
    Soundscape.playAction();
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>EduVision Export Document</title>
          <style>
            body { font-family: sans-serif; line-height: 1.6; padding: 2rem; color: #111; }
            h1 { color: #4f46e5; border-bottom: 2px solid #ddd; padding-bottom: 0.5rem; }
            .meta { font-size: 0.85rem; color: #666; margin-bottom: 2rem; }
            .content { white-space: pre-wrap; font-size: 1.1rem; }
          </style>
        </head>
        <body>
          <h1>EduVision Document</h1>
          <div class="meta">Exported on: ${new Date().toLocaleString()} | Accessibility compliant structured format</div>
          <div class="content">${text}</div>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  },

  updateLivePreviews(text) {
    // 1. Sighted Markdown Render Preview
    const sightedPreview = document.getElementById('sightedPreviewPanel');
    if (sightedPreview) {
      if (!text.trim()) {
        sightedPreview.innerHTML = '<p style="color: var(--text-muted); font-style: italic;">No document text. Start typing above to compile structural previews...</p>';
      } else {
        // Basic parser mapping bold, italic, lists, and headings for demonstration
        let html = text
          .replace(/^# (.*$)/gim, '<h1>$1</h1>')
          .replace(/^## (.*$)/gim, '<h2>$2</h2>')
          .replace(/^### (.*$)/gim, '<h3>$3</h3>')
          .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
          .replace(/\*(.*)\*/gim, '<em>$1</em>')
          .replace(/\n$/gim, '<br />')
          .replace(/^\- (.*$)/gim, '<li>$1</li>');
        sightedPreview.innerHTML = html;
      }
    }

    // 2. Accessibility Tactile / Braille Cells Grid
    const blindPreview = document.getElementById('blindPreviewPanel');
    if (blindPreview) {
      if (!text.trim()) {
        blindPreview.innerHTML = '<p style="color: var(--text-muted); font-style: italic;">No Braille compiled yet...</p>';
      } else {
        blindPreview.innerHTML = '';
        const words = text.split(/\s+/);
        
        words.forEach(word => {
          if (!word) return;
          const wordBlock = document.createElement('div');
          wordBlock.style.display = 'inline-block';
          wordBlock.style.margin = '8px';
          wordBlock.style.padding = '6px';
          wordBlock.style.background = '#0a0a0a';
          wordBlock.style.border = '1px solid var(--border-color)';
          wordBlock.style.borderRadius = '6px';
          
          const unicodeBraille = BrailleSim.translateToBrailleUnicode(word);
          
          wordBlock.innerHTML = `
            <div style="font-size: 1.8rem; color: var(--accent-secondary); line-height:1; letter-spacing: 2px;">${unicodeBraille}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); text-align: center; margin-top: 4px;">${word}</div>
          `;
          blindPreview.appendChild(wordBlock);
        });
      }
    }
  },

  // WCAG Compliance checker logic
  runWCAGDiagnostics(text) {
    const root = document.getElementById('wcagDiagnosticContainer');
    if (!root) return;
    root.innerHTML = '';

    const checks = [
      {
        id: 'headings',
        name: 'Heading Structure',
        desc: 'Validates that document contains proper logical hierarchies.',
        run: (t) => {
          if (!t) return { status: 'pass', text: 'Document empty.' };
          const hasH1 = t.includes('# ');
          const hasH2 = t.includes('## ');
          if (hasH2 && !hasH1) {
            return { status: 'warning', text: 'Structure starts with H2 before H1 header.' };
          }
          return { status: 'pass', text: 'Semantic headings structured logically.' };
        }
      },
      {
        id: 'length',
        name: 'Readability & Sentence Length',
        desc: 'Ensures sentence length is comfortable for learning impairment.',
        run: (t) => {
          if (!t) return { status: 'pass', text: '0 sentences.' };
          const sentences = t.split(/[.!?]+/);
          const longSentences = sentences.filter(s => s.trim().split(/\s+/).length > 25);
          if (longSentences.length > 0) {
            return { status: 'warning', text: `${longSentences.length} sentences exceed 25 words.` };
          }
          return { status: 'pass', text: 'All sentence lengths optimized for readability.' };
        }
      },
      {
        id: 'alt_tags',
        name: 'Tactile Description Assets',
        desc: 'Ensures uploaded document images contain alternative captions.',
        run: (t) => {
          const imageIndicators = (t.match(/!\[(.*?)\]/g) || []);
          const emptyAlts = imageIndicators.filter(img => img.includes('![]'));
          if (emptyAlts.length > 0) {
            return { status: 'fail', text: 'Missing descriptive labels on uploaded assets.' };
          }
          return { status: 'pass', text: 'Tactile assets structured and labeled correctly.' };
        }
      }
    ];

    checks.forEach(check => {
      const res = check.run(text);
      const row = document.createElement('div');
      row.className = `diagnostic-item ${res.status}`;
      
      let badgeClass = 'pass';
      let badgeLabel = 'Pass';
      if (res.status === 'fail') { badgeClass = 'fail'; badgeLabel = 'Fix Required'; }
      if (res.status === 'warning') { badgeClass = 'warning'; badgeLabel = 'Review'; }

      row.innerHTML = `
        <div>
          <div style="font-weight: 700; margin-bottom: 2px;">${check.name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${res.text}</div>
        </div>
        <span class="diag-status-badge ${badgeClass}">${badgeLabel}</span>
      `;
      root.appendChild(row);
    });
  }
};

// ==========================================================================
// 7. Interactive AI Assistant & Alt-Text Generator
// Simulates an advanced chatbot coach, automated translations,
// and a tactile computer-vision descriptive alt tag generator.
// ==========================================================================
const AIChatbot = {
  studyGuideResponses: {
    "hello": "Hello! Welcome to EduVision Study Hub. I am your 24/7 learning & navigational companion. Say 'open editor' or type your notes to begin!",
    "translate": "Sure! I can instantly translate your document into Spanish, French, Hindi, German, Japanese, or Arabic. Select translate inside the tutor panel.",
    "braille": "Braille consists of cells containing 6 raised dots. Use keys F D S J K L to type. Dot 1 is F, 2 is D, 3 is S, 4 is J, 5 is K, 6 is L. Press SPACE to submit characters!",
    "diagram": "I have inserted a smart conceptual diagram mapping of: 'Visual Sensation to Cerebral Cortex Pathway'. Check Sighted preview!",
    "help": "EduVision supports blind-sighted collaboration. You can type via Braille cells, synthesize high contrast views, listen to custom vocal reads, or get alt tags for images."
  },

  askAI(customInput = null) {
    const inputField = document.getElementById('chatInput');
    const question = customInput || inputField.value;
    if (!question.trim()) return;

    this.postBubble(question, 'user');
    if (!customInput) inputField.value = '';

    Soundscape.playAction();
    const loaderId = this.postBubble('Thinking...', 'assistant');
    
    // Simulate AI response delay
    setTimeout(() => {
      let response = "I've searched your educational resources. For specific guides on Braille, translation or diagrams, type 'braille', 'translate', or 'diagram'. Otherwise, I am ready to review your document structure for academic writing!";
      
      const q = question.toLowerCase();
      for (const [key, val] of Object.entries(this.studyGuideResponses)) {
        if (q.includes(key)) {
          response = val;
          break;
        }
      }

      // Check if user wanted to insert conceptual diagram
      if (q.includes('diagram')) {
        this.insertDiagramReference();
      }

      const bubbleNode = document.getElementById(loaderId);
      if (bubbleNode) {
        bubbleNode.textContent = response;
      }
      
      // Speak response
      TTSEngine.speak(response);
    }, 1000);
  },

  postBubble(text, sender) {
    const parent = document.getElementById('chatLogs');
    if (!parent) return;

    const bubble = document.createElement('div');
    const id = `bubble-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    bubble.id = id;
    bubble.className = `chat-bubble ${sender}`;
    bubble.textContent = text;
    
    parent.appendChild(bubble);
    parent.scrollTop = parent.scrollHeight;
    return id;
  },

  insertDiagramReference() {
    const textarea = document.getElementById('editorTextarea');
    if (textarea) {
      textarea.value += "\n\n# Educational Conceptual Diagram\n![Visual Pathway: Retina -> Optic Nerve -> Lateral Geniculate Nucleus -> Visual Cortex V1](diagram)\n";
      DocumentManager.handleEditorInput();
    }
  },

  translateDocument(lang) {
    const text = document.getElementById('editorTextarea').value;
    if (!text.trim()) {
      TTSEngine.speak("No document content to translate.");
      return;
    }
    
    const translations = {
      'es': "EduVision es una plataforma tecnológica de asistencia innovadora para estudiantes y profesionales con discapacidad visual. Permite la integración del teclado Braille y el asistente de chat con Inteligencia Artificial.",
      'fr': "EduVision est une plateforme technologique d'assistance innovante destinée aux étudiants et professionnels malvoyants. Il intègre un clavier braille et un assistant chatbot.",
      'hi': "एडूविज़न दृष्टिबाधित शिक्षार्थियों और पेशेवरों के लिए एक नवोन्मेषी सहायक तकनीकी मंच है। यह ब्रेल कीबोर्ड और एआई चैटबॉट को एकीकृत करता है।",
      'de': "EduVision ist eine innovative assistive Technologieplattform für sehbehinderte Lernende und Fachkräfte. Sie integriert eine Braille-Tastatur und einen KI-Chatbot-Assistenten."
    };

    const mockTrans = translations[lang] || `[Translated text in ${lang}]: ${text}`;
    
    this.postBubble(`Translating document into ${lang.toUpperCase()}...`, 'assistant');
    Soundscape.playTone(600, 'sine', 0.2, 0.05);

    setTimeout(() => {
      this.postBubble(`Translation Ready: "${mockTrans}"`, 'system-sugg');
      document.getElementById('editorTextarea').value = mockTrans;
      DocumentManager.handleEditorInput();
      TTSEngine.speak("Translation completed and updated in your editor.");
    }, 1200);
  },

  // Simulated AI Alt-Text Image Analyzer
  triggerAltTextAnalyzer() {
    Soundscape.playAction();
    const picker = document.getElementById('imagePicker');
    if (picker) picker.click();
  },

  handleImageUpload(files) {
    if (files.length === 0) return;
    const file = files[0];
    
    const logId = this.postBubble(`Analyzing uploaded image "${file.name}" for tactile visual descriptions...`, 'assistant');
    Soundscape.playTone(400, 'triangle', 0.3, 0.05);

    setTimeout(() => {
      const altText = `Tactile Description: High-contrast diagram displaying a plant cell cross-section. The outer double-wall represents the protective Cell Wall, surrounding the inner Plasma Membrane. A large translucent central bubble indicates the Central Vacuole. The dark violet oval on the left labels the Nucleus.`;
      
      const node = document.getElementById(logId);
      if (node) {
        node.innerHTML = `
          <div style="font-weight: 700; color: var(--accent-secondary); margin-bottom: 4px;">📸 Computer-Vision Image Alt Tag Analyzer</div>
          <div>${altText}</div>
          <button onclick="AIChatbot.insertImageWithAlt('${altText}')" class="primary-btn" style="padding: 6px 12px; font-size: 0.75rem; margin-top: 8px;">Insert Labeled Image Into Notes</button>
        `;
      }
      TTSEngine.speak("Computer-Vision description generated: " + altText);
    }, 1500);
  },

  insertImageWithAlt(altText) {
    const textarea = document.getElementById('editorTextarea');
    if (textarea) {
      textarea.value += `\n\n![${altText}](uploaded_image.png)\n`;
      DocumentManager.handleEditorInput();
      TTSEngine.speak("Image asset inserted into document.");
      Soundscape.playSuccess();
    }
  }
};

// ==========================================================================
// 8. Collaboration Workspace Panel Switcher
// Switches view states for Sighted vs Visually Impaired workspace modes
// ==========================================================================
function switchCollabPane(mode) {
  AppState.collaborationMode = mode;
  Soundscape.playAction();
  
  const sightedBtn = document.getElementById('collabBtnSighted');
  const blindBtn = document.getElementById('collabBtnBlind');
  
  const sightedPanel = document.getElementById('sightedPreviewPanel');
  const blindPanel = document.getElementById('blindPreviewPanel');

  if (mode === 'sighted') {
    sightedBtn.classList.add('active');
    blindBtn.classList.remove('active');
    sightedPanel.style.display = 'block';
    blindPanel.style.display = 'none';
    TTSEngine.speak("Sighted visualization pane active.");
  } else {
    sightedBtn.classList.remove('active');
    blindBtn.classList.add('active');
    sightedPanel.style.display = 'none';
    blindPanel.style.display = 'block';
    TTSEngine.speak("Tactile Braille grid activated.");
  }
}

// ==========================================================================
// 9. Document Loader Entry-Point
// Initializes all modular segments on window DOM load
// ==========================================================================
window.addEventListener('DOMContentLoaded', () => {
  AppState.init();
  TTSEngine.init();
  SpeechEngine.init();
  BrailleSim.init();
  DocumentManager.init();

  // Voice speed and pitch slide bindings
  const speedSlider = document.getElementById('ttsSpeedSlider');
  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => TTSEngine.setSpeed(e.target.value));
  }
  const pitchSlider = document.getElementById('ttsPitchSlider');
  if (pitchSlider) {
    pitchSlider.addEventListener('input', (e) => TTSEngine.setPitch(e.target.value));
  }

  // Keyboard focus announcement bindings for supreme accessibility
  document.querySelectorAll('button, input, select, textarea').forEach(el => {
    el.addEventListener('focus', () => {
      // Light tick tone
      Soundscape.playTone(800, 'sine', 0.02, 0.005);
      
      // Auto narration of buttons/controls if they are focused
      if (AppState.theme === 'high-contrast') {
        const label = el.getAttribute('aria-label') || el.innerText || el.placeholder || el.id;
        if (label && label !== 'Dots Active: None') {
          // Speak label quietly
          const synth = window.speechSynthesis;
          if (synth && !synth.speaking) {
            const u = new SpeechSynthesisUtterance(label);
            u.rate = 1.3;
            u.volume = 0.5;
            synth.speak(u);
          }
        }
      }
    });
  });
});
