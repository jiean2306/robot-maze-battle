# Showcase & Community Bots

Drop-in autonomous JavaScript robots built for **Maze Bots**. Anyone can import these directly into the Arena (`Edit / Paste Code` -> `Import .js`), test them in **Auto-Train ×5**, or open a Pull Request adding their own fighter!

## Included Showcase Fighters

| File | Bot Name | Style | Self-Learning |
| --- | --- | --- | --- |
| [`rl-evobot.js`](./rl-evobot.js) | `Gemini` (`Self-Learning RL EvoBot`) | UCB1 3-Arm Strategy Bandit + online event calibration + evolutionary weights | Yes (`state.brain`, `state.events`, `onMatchEnd`) |
| [`ricochet-bank-pro.js`](./ricochet-bank-pro.js) | `Prism-JS` (`Ricochet Mathematician`) | 36-angle ray mirror solver prioritizing `+15%` Pillar bank shots around cover | Stateless |
| [`apex-tactical.js`](./apex-tactical.js) | `Apex-JS` (`Lead Hunter`) | Reactive bullet dodging, A* pursuit, velocity-lead fixed-forward aiming | Stateless |

## Bot Contract (`const BOT = { ... };`)

Every `.js` file in `bots/` must be zero-dependency, sandbox-safe (no DOM/network/imports), and follow this shape:

```javascript
const BOT = {
  name: "Gemini", // "Gemini", "Grok", "ChatGPT", "Claude", or "DeepSeek"
  author: "Your Name / Model Version",
  algorithm: "Explain how navigation, aiming, dodging, power-ups, regen, and learning work.",
  thoughts: "Explain why you designed this strategy and what trade-offs you made.",
  think(state) {
    // Runs at ~30Hz inside an isolated Web Worker (< 2ms target, 250ms hard cap)
    // state gives: me, enemies, bullets, powerups, traps, lidar, maze, rules, memory, brain, events
    return {
      throttle: 0.8, // -1..1 (reverse is 72% speed)
      turn: 0,       // -1..1 (fixed-forward cannon: rotate chassis to aim!)
      fire: false,   // boolean
      regen: false,  // boolean (consumes 3 ammo -> heals +10% current HP, 10s CD)
      say: ""        // optional string <= 22 chars
    };
  },
  onMatchEnd(report, brain) {
    // Runs after each match; mutate & return JSON-serializable `brain` (< 64KB)
    brain.gen = (brain.gen || 1) + 1;
    brain.summary = "Gen " + brain.gen + ": tuned policy after match #" + brain.gen;
    return brain;
  }
};
```

## Contributing a Bot via Pull Request

1. Launch the arena locally or via GitHub Pages and click **Copy Prompt for Any AI** in the Arena Rules bar.
2. Paste the prompt into Gemini, Claude, ChatGPT, Grok, or DeepSeek (or hand-craft your own bot).
3. Save your bot as `bots/<your-bot-name>.js` using **Export .js**.
4. Test it in **Code Arena** for at least 3–5 matches (and verify zero Worker errors).
5. Open a PR adding your `.js` file and summarizing your bot's strategy!
