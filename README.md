# Maze Bots — AI Code & PvP Robot Arena

[![Zero Dependencies](https://img.shields.io/badge/dependencies-zero%20(Vanilla%20JS)-16a34a)](#)
[![GitHub Pages Ready](https://img.shields.io/badge/GitHub%20Pages-ready-2563eb)](#publish-to-github--enable-github-pages)
[![License: MIT](https://img.shields.io/badge/license-MIT-64748b)](./LICENSE)

> **Live Demo:** https://jiean2306.github.io/robot-maze-battle/

An interactive **autonomous AI benchmark + local 1P/2P tank ricochet arena** built with pure HTML5 Canvas, CSS, and Vanilla JavaScript. Pit custom self-learning bots coded by **Gemini, Claude, ChatGPT, Grok, and DeepSeek** against one another in isolated Web Workers — or jump in yourself with keyboard controls, every-2nd-shot Aimbot, special bullet-trigger walls, random power-ups, and Web Audio synth soundscapes.

---

## Key Features

### 1. Autonomous AI Code Arena (Sandboxed Web Workers)
- **LLM Showdown Ready:** One-click **Copy Prompt for Any AI** dynamically injects your exact match rules, coordinate physics, power-up specs, and `state` API into a ready-to-paste prompt.
- **Model Identities & Custom Skins:** Bots named `Gemini`, `Claude`, `ChatGPT`, `Grok`, and `DeepSeek` automatically sport distinct custom chassis silhouettes, turret emblems, and signature Web Audio cannon synths.
- **Algorithm & Design Thoughts Inspector:** Every coded bot includes `algorithm` and `thoughts` explanations viewable live in the **Mind** tab and Victory podium.
- **Post-Match AI Coaching Reports:** Automatically analyzes accuracy, wall bumps, ammo droughts, dodges, bank shots, power-ups, and Regen timing — generating a copy-paste rematch upgrade prompt for the AI model.

### 2. True Cross-Match Self-Learning (`state.brain` + `onMatchEnd`)
- **Persistent Brain (`state.brain`):** Saved automatically in `localStorage` per bot (up to 64 KB) across matches — enabling Q-tables, UCB1 bandits, parameter hill-climbing, and opponent modeling.
- **Real-Time Events (`state.events`):** Live per-tick event stream (`hit_dealt`, `hit_taken`, `shot_missed`, `dodge_close`, `kill`, `powerup`, `regen`, `special_wall`) for mid-match micro-adaptation.
- **Evolution Hook (`onMatchEnd(report, brain)`):** Invoked after every match with full telemetry to evolve policies generation after generation (`Gen #1 -> Gen #2 -> ...`).
- **Fast Auto-Train ×5 (`4×` Speed):** Auto-runs 5 consecutive randomized-maze matches at 4× simulation speed so self-learning bots visibly evolve in under a minute, inspectable in the **Self-Learning Brain** tab.

### 3. Tactile Combat, Maze Physics & Power-Ups
- **Fixed-Forward Tank Cannon:** No independent turret aiming — bots and players must rotate their chassis to aim direct lead shots or multi-bounce corner bank shots.
- **Fully Randomized Spawns:** Every match randomizes starting locations and sightline-safe facing angles across connected `45×33` mazes in **6 procedural visual themes** (*Blueprint Lab*, *Sandstone Oasis*, *Botanical Zen*, *Arctic Frost*, *Sakura Courtyard*, *Solar Foundry*).
- **8 Random Arena Power-Ups** *(first drop at 2s, then every 5–10s)*:
  `Piercing` · `Wall Penetrate` · `Speed+` · `Ultra Ricochet` · `Laser Beam` · `Energy Shield` · `Shock Trap` · `Reflective Shield`
- **Interactive Wall Mechanics:**
  - **Central Reinforced Pillars (`◆`):** Supercharge bounced bullets (`+8%` speed, `+15%` damage).
  - **`+R` Range Booster Wall (Cyan):** Expands bullet range by `+350px` & grants `+2` extra wall bounces.
  - **`»` Turbo Accelerator Wall (Amber):** Boosts projectile speed by `+45%`.
  - **`3×` 3-Way Splitter Wall (Violet):** Splits incoming reflected bullets into a 3-way fan (`±16°`).
- **Active Regen Ability:** Any robot can consume **3 ammo at once** (`10s` CD) to instantly restore **`+10%` current HP**.
- **Human Boss Balance (`P1` / `P2`):** Configurable **`300 HP`**, **`20` Bullets**, and automatic **Aimbot Lock / Corner Bank Snap** on every 2nd shot.
- **100% Procedural Web Audio Synth:** Theme-matched background music + distinct SFX for firing, ascending-pitch ricochets, wall thuds, acceleration, dodging, shields, reflections, traps, regen, and eliminations.

---

## Controls

| Action | Player 1 (`P1`) | Player 2 (`P2`) | Notes |
| --- | --- | --- | --- |
| Drive / Reverse | `W` / `S` *(or Arrows in 1P)* | `↑` / `↓` | Reverse moves at `72%` speed |
| Rotate Chassis | `A` / `D` *(or ← / → in 1P)* | `←` / `→` | Cannon is fixed forward along facing angle |
| Fire Forward | `Space` / `F` / Click | `Enter` / `/` / `RShift` | Every **2nd shot** arms Aimbot lock-on |
| Regen (`+10% HP`) | `E` / `Q` | `.` / `Numpad 0` | Costs `3` ammo · `10s` cooldown |
| Pause / LiDAR | `P` / `L` | `P` / `L` | Toggle simulation pause or LiDAR overlay |

---

## Quick Start (Local)

Zero build tools or `npm install` needed — just serve the folder statically (Web Workers work best over `http://localhost` rather than `file://`):

```bash
# Python 3
python -m http.server 8765

# OR Node.js
npx serve . -p 8765
```

Then open `http://localhost:8765` in your browser!

1. Click **Code Arena** -> **Start Battle** -> **Auto-Train ×5** to watch AI-coded bots battle and self-learn across generations.
2. Or click **2P Versus** for instant local 2-player PvP, or customize any slot (`AI`, `Code`, `P1`, `P2`) with `2` to `4` fighters.
3. Click **Copy Prompt for Any AI** to challenge Gemini, Claude, ChatGPT, Grok, or DeepSeek with your custom arena rules.

---

## Project Structure

```text
robot-maze-battle/
├── index.html          # App layout, rules studio, modals, live arena HUD & legend
├── style.css           # Light-mode responsive UI, HUD cards, Brain Inspector styling
├── game.js             # Engine: maze generator, physics, Web Audio, Web Worker sandbox & AI
├── bots/               # Standalone showcase & community bots (see bots/README.md)
│   ├── rl-evobot.js
│   ├── ricochet-bank-pro.js
│   ├── apex-tactical.js
│   └── README.md
├── LICENSE             # MIT License
├── .nojekyll           # Disables Jekyll processing on GitHub Pages
└── README.md
```

---

## Publish to GitHub & Enable GitHub Pages

1. **Create a new repository on GitHub** (e.g., `robot-maze-battle`, public or private) without adding an extra README/license.
2. **Push your local `main` branch:**
   ```bash
   git remote add origin https://github.com/jiean2306/robot-maze-battle.git
   git push -u origin main
   ```
3. **Turn on GitHub Pages:**
   Open **Repository -> Settings -> Pages -> Build and deployment**, set **Source** to `Deploy from a branch`, choose `main` / `/ (root)`, and click **Save**. Your live playable game will be up at `https://jiean2306.github.io/robot-maze-battle/` in ~1 minute!

---

*Built for autonomous code battles, algorithmic experimentation, and fun local couch PvP.*
