// ─── Constants & Config ──────────────────────────────────────────────────────
const DIFFICULTIES = {
  easy:   { time: 60, spawnRate: 1400, blobSpeed: [0.4, 1.0],  minR: 28, maxR: 58, scoreBase: 10 },
  medium: { time: 45, spawnRate: 950,  blobSpeed: [0.7, 1.8],  minR: 22, maxR: 48, scoreBase: 15 },
  hard:   { time: 30, spawnRate: 600,  blobSpeed: [1.2, 2.6],  minR: 16, maxR: 38, scoreBase: 25 },
};

const BUBBLE_COLORS = [
  { fill: '#a855f7', glow: '#a855f7', name: 'PURPLE' },
  { fill: '#06d6a0', glow: '#06d6a0', name: 'CYAN'   },
  { fill: '#48cae4', glow: '#48cae4', name: 'BLUE'   },
  { fill: '#ff6b6b', glow: '#ff6b6b', name: 'RED'    },
  { fill: '#ffd166', glow: '#ffd166', name: 'GOLD'   },
  { fill: '#ef80ff', glow: '#ef80ff', name: 'PINK'   },
  { fill: '#4dd637', glow: '#4dd637', name: 'GREEN'  },
];

const SPECIAL_BUBBLE_CHANCE = 0.08; // 8% chance of a "bomb" bubble (gold, x3)
const COMBO_TIMEOUT = 1800;         // ms to reset combo
const MISS_PENALTY = 0;             // score penalty per miss (0 = no penalty)

// ─── State ───────────────────────────────────────────────────────────────────
let difficulty = 'easy';
let gameRunning = false;
let score = 0;
let timeLeft = 60;
let combo = 1;
let maxCombo = 1;
let bubblesPopped = 0;
let totalClicks = 0;
let spawnTimer = null;
let countdownTimer = null;
let comboTimer = null;
let bubbles = [];
let particles = [];
let popups = [];
let animFrame = null;

// ─── DOM Refs ─────────────────────────────────────────────────────────────────
const startScreen   = document.getElementById('startScreen');
const gameScreen    = document.getElementById('gameScreen');
const gameOverScreen= document.getElementById('gameOverScreen');
const scoreEl       = document.getElementById('score');
const timerEl       = document.getElementById('timer');
const comboEl       = document.getElementById('combo');
const finalScoreEl  = document.getElementById('finalScore');
const statBubblesEl = document.getElementById('statBubbles');
const statComboEl   = document.getElementById('statCombo');
const statAccEl     = document.getElementById('statAccuracy');
const newHSEl       = document.getElementById('newHighScore');
const hsDEl         = document.getElementById('highScoreDisplay');
const gameCanvas    = document.getElementById('gameCanvas');
const bgCanvas      = document.getElementById('bgCanvas');
const gc            = gameCanvas.getContext('2d');
const bc            = bgCanvas.getContext('2d');

// ─── Resize ───────────────────────────────────────────────────────────────────
function resize() {
  const W = window.innerWidth, H = window.innerHeight;
  gameCanvas.width  = W; gameCanvas.height  = H;
  bgCanvas.width    = W; bgCanvas.height    = H;
}
resize();
window.addEventListener('resize', resize);

// ─── Background Stars ─────────────────────────────────────────────────────────
const stars = Array.from({ length: 200 }, () => ({
  x: Math.random() * window.innerWidth,
  y: Math.random() * window.innerHeight,
  r: Math.random() * 1.5 + 0.2,
  a: Math.random(),
  da: (Math.random() - 0.5) * 0.008,
}));

function drawBackground() {
  const W = bgCanvas.width, H = bgCanvas.height;
  bc.clearRect(0, 0, W, H);

  // Deep space gradient
  const grad = bc.createRadialGradient(W/2, H/2, 0, W/2, H/2, W * 0.8);
  grad.addColorStop(0, '#0d0a1e');
  grad.addColorStop(1, '#050510');
  bc.fillStyle = grad;
  bc.fillRect(0, 0, W, H);

  // Nebula blobs
  const blobs = [[W*0.2, H*0.3, '#a855f7', 200], [W*0.8, H*0.7, '#06d6a0', 160], [W*0.6, H*0.2, '#48cae4', 140]];
  blobs.forEach(([bx, by, col, br]) => {
    const ng = bc.createRadialGradient(bx, by, 0, bx, by, br);
    ng.addColorStop(0, col + '18');
    ng.addColorStop(1, 'transparent');
    bc.fillStyle = ng;
    bc.beginPath(); bc.arc(bx, by, br, 0, Math.PI*2); bc.fill();
  });

  // Stars
  stars.forEach(s => {
    s.a += s.da;
    if (s.a < 0 || s.a > 1) s.da *= -1;
    bc.globalAlpha = s.a;
    bc.fillStyle = '#fff';
    bc.beginPath(); bc.arc(s.x, s.y, s.r, 0, Math.PI*2); bc.fill();
  });
  bc.globalAlpha = 1;
}

// ─── Bubble Factory ───────────────────────────────────────────────────────────
function makeBubble() {
  const cfg = DIFFICULTIES[difficulty];
  const color = BUBBLE_COLORS[Math.floor(Math.random() * BUBBLE_COLORS.length)];
  const isSpecial = Math.random() < SPECIAL_BUBBLE_CHANCE;
  const r = cfg.minR + Math.random() * (cfg.maxR - cfg.minR);
  const W = gameCanvas.width;
  const spd = cfg.blobSpeed[0] + Math.random() * (cfg.blobSpeed[1] - cfg.blobSpeed[0]);
  const angle = (Math.random() * 80 + 20) * (Math.PI / 180); // upward
  return {
    x: r + Math.random() * (W - r * 2),
    y: gameCanvas.height + r + 10,
    r,
    vx: (Math.random() - 0.5) * 0.5,
    vy: -spd,
    color: isSpecial ? { fill: '#ffd166', glow: '#ffd166', name: 'GOLD' } : color,
    special: isSpecial,
    pulse: Math.random() * Math.PI * 2,
    pulseSpeed: 0.04 + Math.random() * 0.04,
    wobble: 0,
    wobbleDir: Math.random() * Math.PI * 2,
    dead: false,
    opacity: 1,
  };
}

function spawnBubble() {
  if (!gameRunning) return;
  bubbles.push(makeBubble());
  spawnTimer = setTimeout(spawnBubble, DIFFICULTIES[difficulty].spawnRate + (Math.random() - 0.5) * 300);
}

// ─── Particles ────────────────────────────────────────────────────────────────
function burst(x, y, color, count = 18) {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const speed = 2 + Math.random() * 5;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 2 + Math.random() * 4,
      color,
      alpha: 1,
      decay: 0.025 + Math.random() * 0.02,
      gravity: 0.08,
    });
  }
}

// ─── Score Popup ──────────────────────────────────────────────────────────────
function showPopup(x, y, text, color = '#fff') {
  popups.push({ x, y, text, color, alpha: 1, vy: -1.5, life: 60 });
}

// ─── Draw Bubble ─────────────────────────────────────────────────────────────
function drawBubble(b) {
  const { x, y, r, color, special, pulse, opacity } = b;
  const pr = r + Math.sin(pulse) * (special ? 4 : 2);

  gc.save();
  gc.globalAlpha = opacity;

  // Glow
  gc.shadowColor = color.glow;
  gc.shadowBlur = special ? 40 : 25;

  // Main gradient fill
  const grad = gc.createRadialGradient(x - r * 0.3, y - r * 0.35, 0, x, y, pr);
  grad.addColorStop(0, color.fill + 'cc');
  grad.addColorStop(0.6, color.fill + '88');
  grad.addColorStop(1, color.fill + '33');
  gc.fillStyle = grad;
  gc.beginPath(); gc.arc(x, y, pr, 0, Math.PI * 2); gc.fill();

  // Rim / stroke
  gc.shadowBlur = 0;
  gc.strokeStyle = color.fill + 'aa';
  gc.lineWidth = 2;
  gc.stroke();

  // Shine highlight
  gc.shadowBlur = 0;
  const shine = gc.createRadialGradient(x - r * 0.3, y - r * 0.35, 0, x - r * 0.3, y - r * 0.35, r * 0.5);
  shine.addColorStop(0, 'rgba(255,255,255,0.45)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  gc.fillStyle = shine;
  gc.beginPath(); gc.arc(x - r * 0.3, y - r * 0.35, r * 0.5, 0, Math.PI * 2); gc.fill();

  // Special label
  if (special) {
    gc.fillStyle = '#050510';
    gc.font = `bold ${Math.max(10, r * 0.45)}px Orbitron`;
    gc.textAlign = 'center'; gc.textBaseline = 'middle';
    gc.fillText('x3', x, y);
  }

  gc.restore();
}

// ─── Main Loop ─────────────────────────────────────────────────────────────────
function loop() {
  const W = gameCanvas.width, H = gameCanvas.height;
  gc.clearRect(0, 0, W, H);
  drawBackground();

  // Update & draw bubbles
  bubbles.forEach(b => {
    if (b.dead) return;
    b.pulse += b.pulseSpeed;
    b.x += b.vx + Math.sin(b.wobbleDir + b.wobble) * 0.4;
    b.y += b.vy;
    b.wobble += 0.02;
    if (b.y + b.r < 0) b.dead = true; // flew off screen
    drawBubble(b);
  });
  bubbles = bubbles.filter(b => !b.dead);

  // Update & draw particles
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy; p.vy += p.gravity;
    p.alpha -= p.decay;
    if (p.alpha <= 0) return;
    gc.save();
    gc.globalAlpha = p.alpha;
    gc.fillStyle = p.color;
    gc.shadowColor = p.color; gc.shadowBlur = 8;
    gc.beginPath(); gc.arc(p.x, p.y, p.r, 0, Math.PI * 2); gc.fill();
    gc.restore();
  });
  particles = particles.filter(p => p.alpha > 0);

  // Floating score popups
  popups.forEach(pop => {
    pop.y += pop.vy; pop.alpha -= 0.018; pop.life--;
    if (pop.alpha <= 0) return;
    gc.save();
    gc.globalAlpha = pop.alpha;
    gc.fillStyle = pop.color;
    gc.shadowColor = pop.color; gc.shadowBlur = 15;
    gc.font = `bold ${combo >= 3 ? 28 : 20}px Orbitron`;
    gc.textAlign = 'center'; gc.textBaseline = 'middle';
    gc.fillText(pop.text, pop.x, pop.y);
    gc.restore();
  });
  popups = popups.filter(p => p.alpha > 0 && p.life > 0);

  if (gameRunning) animFrame = requestAnimationFrame(loop);
}

// ─── Click Handler ────────────────────────────────────────────────────────────
function handleClick(e) {
  if (!gameRunning) return;
  const rect = gameCanvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;

  totalClicks++;
  let hit = false;

  // Check from top (smallest = on top)
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    if (b.dead) continue;
    const dx = cx - b.x, dy = cy - b.y;
    if (dx*dx + dy*dy <= b.r*b.r) {
      // Pop!
      b.dead = true;
      hit = true;
      bubblesPopped++;

      const pts = Math.round(DIFFICULTIES[difficulty].scoreBase * (b.special ? 3 : 1) * (b.r > 40 ? 0.8 : b.r < 25 ? 1.5 : 1) * combo);
      score += pts;
      scoreEl.textContent = score;

      // Combo
      clearTimeout(comboTimer);
      combo = Math.min(combo + 1, 8);
      if (combo > maxCombo) maxCombo = combo;
      comboEl.textContent = `x${combo}`;
      comboEl.style.color = combo >= 4 ? '#ffd166' : combo >= 2 ? '#06d6a0' : '#e2e8f0';
      comboTimer = setTimeout(() => { combo = 1; comboEl.textContent = 'x1'; comboEl.style.color = ''; }, COMBO_TIMEOUT);

      burst(b.x, b.y, b.color.fill, b.special ? 30 : 18);
      const label = b.special ? `x3 +${pts}!` : combo >= 3 ? `COMBO! +${pts}` : `+${pts}`;
      showPopup(b.x, b.y - b.r, label, b.special ? '#ffd166' : b.color.fill);
      break;
    }
  }

  if (!hit) {
    // Miss ripple
    gc.save();
    gc.strokeStyle = '#ffffff22';
    gc.lineWidth = 2;
    gc.beginPath(); gc.arc(cx, cy, 20, 0, Math.PI*2); gc.stroke();
    gc.restore();
  }
}

gameCanvas.addEventListener('click', handleClick);
gameCanvas.addEventListener('touchstart', e => {
  e.preventDefault();
  handleClick({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
}, { passive: false });

// ─── Timer ────────────────────────────────────────────────────────────────────
function tick() {
  if (!gameRunning) return;
  timeLeft--;
  timerEl.textContent = timeLeft;
  if (timeLeft <= 10) { timerEl.style.color = '#ff6b6b'; timerEl.style.textShadow = '0 0 15px #ff6b6b'; }
  if (timeLeft <= 0) { endGame(); return; }
  countdownTimer = setTimeout(tick, 1000);
}

// ─── Start / End ──────────────────────────────────────────────────────────────
function showScreen(name) {
  [startScreen, gameScreen, gameOverScreen].forEach(s => s.classList.remove('active'));
  document.getElementById(name + 'Screen').classList.add('active');
}

function startGame() {
  const cfg = DIFFICULTIES[difficulty];
  score = 0; timeLeft = cfg.time; combo = 1; maxCombo = 1;
  bubblesPopped = 0; totalClicks = 0;
  bubbles = []; particles = []; popups = [];
  gameRunning = true;

  scoreEl.textContent = '0';
  timerEl.textContent = cfg.time;
  timerEl.style.color = ''; timerEl.style.textShadow = '';
  comboEl.textContent = 'x1'; comboEl.style.color = '';

  showScreen('game');
  spawnBubble();
  tick();
  animFrame = requestAnimationFrame(loop);
}

function endGame() {
  gameRunning = false;
  clearTimeout(spawnTimer); clearTimeout(countdownTimer); clearTimeout(comboTimer);
  cancelAnimationFrame(animFrame);

  // Save high score
  const hsKey = `hs_${difficulty}`;
  const prev = parseInt(localStorage.getItem(hsKey) || '0');
  const isNewHS = score > prev;
  if (isNewHS) localStorage.setItem(hsKey, score);

  finalScoreEl.textContent = score;
  statBubblesEl.textContent = bubblesPopped;
  statComboEl.textContent = `x${maxCombo}`;
  const acc = totalClicks > 0 ? Math.round((bubblesPopped / totalClicks) * 100) : 0;
  statAccEl.textContent = acc + '%';
  newHSEl.style.display = isNewHS ? 'block' : 'none';

  const titles = ['MISSION FAILED 💀', 'NOT BAD 🚀', 'IMPRESSIVE ✨', 'LEGENDARY 🌌'];
  const t = score < 100 ? 0 : score < 300 ? 1 : score < 600 ? 2 : 3;
  document.getElementById('resultTitle').textContent = titles[t];

  setTimeout(() => showScreen('gameOver'), 400);
  updateHighScoreDisplay();
}

function updateHighScoreDisplay() {
  const hs = parseInt(localStorage.getItem(`hs_${difficulty}`) || '0');
  hsDEl.textContent = hs > 0 ? `🏆 BEST: ${hs}` : '';
}

// ─── UI Wiring ────────────────────────────────────────────────────────────────
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('retryBtn').addEventListener('click', startGame);
document.getElementById('menuBtn').addEventListener('click', () => showScreen('start'));

document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    difficulty = btn.dataset.diff;
    updateHighScoreDisplay();
  });
});

// ─── Init ─────────────────────────────────────────────────────────────────────
updateHighScoreDisplay();

// Start bg animation on start screen
(function bgLoop() {
  drawBackground();
  // Idle particle drift
  if (Math.random() < 0.05) {
    const W = bgCanvas.width, H = bgCanvas.height;
    const col = BUBBLE_COLORS[Math.floor(Math.random() * BUBBLE_COLORS.length)];
    particles.push({
      x: Math.random() * W,
      y: H + 5,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -(0.3 + Math.random() * 0.6),
      r: 2 + Math.random() * 4,
      color: col.fill,
      alpha: 0.5 + Math.random() * 0.3,
      decay: 0.003,
      gravity: -0.005,
    });
  }
  particles = particles.filter(p => p.alpha > 0 && p.y > -20);
  if (!gameRunning) {
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += p.gravity; p.alpha -= p.decay;
      bc.save(); bc.globalAlpha = p.alpha;
      bc.fillStyle = p.color; bc.shadowColor = p.color; bc.shadowBlur = 10;
      bc.beginPath(); bc.arc(p.x, p.y, p.r, 0, Math.PI*2); bc.fill(); bc.restore();
    });
    requestAnimationFrame(bgLoop);
  }
})();
