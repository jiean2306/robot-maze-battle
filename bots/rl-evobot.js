const BOT = {
  name: "Gemini",
  author: "Self-Learning RL EvoBot",
  algorithm: "1. Persistent Evolutionary Brain (state.brain): Maintains tunable policy parameters (aimTolerance, leadFactor, dodgeDist, preferredRange, powerupGreed, bankBias, regenHpFrac) plus a 3-arm UCB1 Strategy Bandit (hunter, ricochet, powerup_control) persisted across matches.\n2. Real-Time Online Learning (state.events): Every tick processes live combat events — tightening aim tolerance after misses, widening dodge radius after taking hits, and adapting to bank shots.\n3. Cross-Match Evolution (onMatchEnd): Evaluates fitness (wins, kills, damage, accuracy, survival), reinforces the best policy, applies diagnostic mutations when losing, and logs brain.summary every generation.",
  thoughts: "Static scripts plateau quickly against evolving rivals. By pairing a UCB1 multi-armed strategy bandit with live event-driven micro-calibration and evolutionary hill-climbing in onMatchEnd(report, brain), this robot continuously adapts its shooting discipline, dodging distance, regen timing, and ricochet aggression match after match.",
  think(state) {
    const { me, enemies, bullets, powerups, traps, maze, rules, memory, brain, events } = state;
    const norm = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
    const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

    // 1. Initialize persistent self-learning brain on Generation 1
    if (!brain.initialized) {
      brain.initialized = true;
      brain.gen = 1;
      brain.weights = {
        aimTolerance: 0.10,
        leadFactor: 0.90,
        dodgeDist: 175,
        preferredRange: 245,
        powerupGreed: 0.70,
        bankBias: 0.55,
        regenHpFrac: 0.72
      };
      brain.bestFitness = -1e9;
      brain.bestWeights = { ...brain.weights };
      brain.arms = {
        hunter: { n: 0, reward: 0 },
        ricochet: { n: 0, reward: 0 },
        powerup_control: { n: 0, reward: 0 }
      };
      brain.summary = "Gen 1 initialized: baseline UCB1 bandit & tunable weights.";
    }

    // Choose strategy arm once per match using UCB1 bandit
    if (!memory.arm) {
      const names = Object.keys(brain.arms);
      const totalPlays = names.reduce((s, k) => s + brain.arms[k].n, 0) + 1;
      let bestArm = names[0], bestScore = -1e9;
      for (const k of names) {
        const a = brain.arms[k];
        const score = a.n === 0 ? 1e6 + Math.random() : (a.reward / a.n) + 0.9 * Math.sqrt(Math.log(totalPlays) / a.n);
        if (score > bestScore) { bestScore = score; bestArm = k; }
      }
      memory.arm = bestArm;
      brain.activeArm = bestArm;
      memory.liveMisses = 0;
      memory.liveHits = 0;
    }

    const w = brain.weights;

    // 2. Real-time online adaptation from live combat events!
    if (events && events.length) {
      for (const ev of events) {
        if (ev.type === 'shot_missed') {
          memory.liveMisses++;
          w.aimTolerance = Math.max(0.055, w.aimTolerance - 0.004);
        } else if (ev.type === 'hit_dealt') {
          memory.liveHits++;
          w.aimTolerance = Math.min(0.14, w.aimTolerance + 0.002);
        } else if (ev.type === 'hit_taken') {
          w.dodgeDist = Math.min(235, w.dodgeDist + 6);
          if (ev.bounces > 0) w.bankBias = Math.min(0.95, w.bankBias + 0.04);
        }
      }
    }

    // 3. Smart Regen: consume 3 ammo -> +10% current HP when safely behind cover
    const visibleEnemies = enemies.filter(e => e.visible);
    if (
      me.regenCooldown <= 0 &&
      me.ammo >= (rules.regenCost || 3) &&
      me.hp < me.maxHp * w.regenHpFrac &&
      (visibleEnemies.length === 0 || me.hp < me.maxHp * 0.42)
    ) {
      return { throttle: -0.6, turn: 0.4, fire: false, regen: true, say: "ADAPTIVE REGEN!" };
    }

    // 4. Proactive bullet dodging + enemy trap avoidance
    for (const b of bullets) {
      if (b.ownerId === me.id) continue;
      const rx = me.x - b.x, ry = me.y - b.y;
      const d = Math.hypot(rx, ry);
      if (d > w.dodgeDist || d < 1) continue;
      const bspd = Math.hypot(b.vx, b.vy) || rules.bulletSpeed;
      const bdx = b.vx / bspd, bdy = b.vy / bspd;
      const proj = rx * bdx + ry * bdy;
      if (proj < 0 || proj > w.dodgeDist) continue;
      const perp = Math.abs(rx * (-bdy) + ry * bdx);
      if (perp < 28 && proj / bspd < 1.15) {
        const side = (rx * (-bdy) + ry * bdx) >= 0 ? 1 : -1;
        const dodgeAng = Math.atan2(bdy, bdx) + side * Math.PI * 0.5;
        const err = norm(dodgeAng - me.angle);
        return {
          throttle: Math.abs(err) > 1.7 ? -0.95 : 1.0,
          turn: Math.max(-1, Math.min(1, err * 3.0)),
          fire: false
        };
      }
    }

    for (const tr of traps) {
      if (tr.ownerId === me.id || tr.dist > 54) continue;
      const away = Math.atan2(me.y - tr.y, me.x - tr.x);
      const err = norm(away - me.angle);
      return { throttle: 0.9, turn: Math.max(-1, Math.min(1, err * 2.8)), fire: false };
    }

    if (!enemies.length) return { throttle: 0.4, turn: 0.4, fire: false };

    // 5. Select target (prefer vulnerable/low-HP or visible enemy)
    const target = enemies.slice().sort((a, b) => {
      const sa = (a.visible ? 180 : 0) + (a.reloading || a.stunned ? 75 : 0) - a.dist + (1 - a.hp / (a.maxHp || 100)) * 160;
      const sb = (b.visible ? 180 : 0) + (b.reloading || b.stunned ? 75 : 0) - b.dist + (1 - b.hp / (b.maxHp || 100)) * 160;
      return sb - sa;
    })[0];

    const hasPenetrate = me.buffs.weaponType === 'penetrate' && me.buffs.weaponCharges > 0;
    const hasLaser = me.buffs.weaponType === 'laser' && me.buffs.weaponCharges > 0;
    const hasUltra = me.buffs.weaponType === 'ultra_ricochet' && me.buffs.weaponCharges > 0;
    const muzzleOk = ang => hasPenetrate || !maze.isWall(Math.floor((me.x + Math.cos(ang) * 19) / 20), Math.floor((me.y + Math.sin(ang) * 19) / 20));

    // 6. Direct Lead Aiming (or Penetrate through walls!)
    if ((target.visible || hasPenetrate) && !target.reflecting) {
      const projSpd = hasLaser ? 1e6 : hasUltra ? rules.bulletSpeed * 1.2 : rules.bulletSpeed;
      const flight = hasLaser ? 0 : Math.min(1.3, target.dist / projSpd);
      let px = target.x + target.vx * flight * w.leadFactor;
      let py = target.y + target.vy * flight * w.leadFactor;
      if (!hasPenetrate && !maze.hasLineOfSight(me.x, me.y, px, py)) { px = target.x; py = target.y; }

      const aimAng = Math.atan2(py - me.y, px - me.x);
      const err = norm(aimAng - me.angle);
      const maxRange = hasLaser ? 640 : hasUltra ? 1300 : rules.maxRange - 25;
      const readyShot =
        me.ammo > 0 && !me.reloading && me.fireCooldown <= 0 &&
        Math.abs(err) <= w.aimTolerance &&
        target.dist <= maxRange &&
        muzzleOk(me.angle);

      let throttle = 0.75;
      if (target.dist < w.preferredRange * 0.7) throttle = -0.6;
      else if (Math.abs(err) > 0.45) throttle = 0.2;

      return {
        throttle,
        turn: Math.max(-1, Math.min(1, err * 3.1)),
        fire: readyShot,
        say: readyShot && hasLaser ? "LASER!" : undefined
      };
    }

    // 7. Ricochet & Special Wall Bank Shot solver (using maze.traceShot!)
    if (me.ammo > 0 && !me.reloading && !target.reflecting && (memory.arm === 'ricochet' || w.bankBias > 0.45) && target.dist < 490) {
      if (!memory.bankAt || state.time - memory.bankAt > 0.22) {
        memory.bankAt = state.time;
        memory.bankAng = null;
        const shotRange = hasLaser ? 650 : hasUltra ? 1350 : rules.maxRange - 20;
        const shotBounces = hasLaser ? 2 : hasUltra ? 5 : Math.min(2, rules.maxBounces);
        const samples = 24;
        for (let i = 0; i < samples; i++) {
          const ang = -Math.PI + ((i + Math.random()) / samples) * Math.PI * 2;
          if (!muzzleOk(ang)) continue;
          const mx = me.x + Math.cos(ang) * 19, my = me.y + Math.sin(ang) * 19;
          const tr = maze.traceShot(mx, my, ang, shotRange, shotBounces);
          for (const seg of tr.segments) {
            if (seg.bounceIndex >= 1 && maze.segmentCircleHit(seg.x1, seg.y1, seg.x2, seg.y2, target.x, target.y, 17) !== null) {
              memory.bankAng = ang;
              break;
            }
          }
          if (memory.bankAng !== null) break;
        }
      }
      if (memory.bankAng !== null) {
        const err = norm(memory.bankAng - me.angle);
        const fireBank = Math.abs(err) < 0.08 && me.fireCooldown <= 0 && muzzleOk(me.angle);
        return {
          throttle: 0.1,
          turn: Math.max(-1, Math.min(1, err * 3.2)),
          fire: fireBank,
          say: fireBank ? "RL BANK!" : undefined
        };
      }
    }

    // 8. Objective selection: Power-Up contest vs Target pursuit
    let goal = target;
    const pMult = memory.arm === 'powerup_control' ? 1.45 : w.powerupGreed;
    if (powerups.length > 0) {
      const nearP = powerups.slice().sort((a, b) => a.dist - b.dist)[0];
      if (nearP && nearP.dist < 290 * pMult) goal = nearP;
    }

    if (!memory.path || !memory.path.length || state.time - (memory.pathAt || 0) > 0.35) {
      memory.path = maze.findPath(me.x, me.y, goal.x, goal.y);
      memory.pathAt = state.time;
    }
    while (memory.path.length > 1 && dist(me.x, me.y, memory.path[0].x, memory.path[0].y) < 22) {
      memory.path.shift();
    }
    const wp = memory.path[0] || goal;
    const steer = norm(Math.atan2(wp.y - me.y, wp.x - me.x) - me.angle);

    // Anti-stuck check
    if (!memory.lastPos || state.time - (memory.stuckAt || 0) > 0.85) {
      const moved = memory.lastPos ? dist(me.x, me.y, memory.lastPos.x, memory.lastPos.y) : 99;
      memory.lastPos = { x: me.x, y: me.y };
      memory.stuckAt = state.time;
      if (moved < 10) memory.unstuckUntil = state.time + 0.45;
    }
    if (memory.unstuckUntil && state.time < memory.unstuckUntil) {
      return { throttle: -0.9, turn: 0.9, fire: false };
    }

    return {
      throttle: Math.abs(steer) > 1.3 ? 0.15 : 0.95,
      turn: Math.max(-1, Math.min(1, steer * 2.7)),
      fire: false
    };
  },
  onMatchEnd(report, brain) {
    if (!brain.initialized) return brain;
    const armName = brain.activeArm || 'hunter';
    const arm = brain.arms[armName] || { n: 0, reward: 0 };

    // Compute match fitness reward
    const fitness =
      (report.won ? 120 : 0) +
      report.kills * 45 +
      report.damageDealt * 0.45 +
      report.accuracy * 0.6 +
      report.bankHits * 15 +
      report.powerupsCollected * 8 -
      report.damageTaken * 0.25;

    arm.n += 1;
    arm.reward += fitness;
    brain.arms[armName] = arm;

    const changes = [];
    const w = brain.weights;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    if (fitness >= (brain.bestFitness || -1e9)) {
      brain.bestFitness = Math.round(fitness);
      brain.bestWeights = { ...w };
      changes.push("new best policy (" + armName + ", fit " + Math.round(fitness) + ")");
    } else {
      for (const k of Object.keys(w)) {
        w[k] = w[k] * 0.35 + brain.bestWeights[k] * 0.65;
      }
      if (report.accuracy < 38 && report.shotsFired >= 3) {
        w.aimTolerance = clamp(w.aimTolerance - 0.012, 0.055, 0.14);
        w.leadFactor = clamp(w.leadFactor + (Math.random() - 0.5) * 0.14, 0.72, 1.08);
        changes.push("tightened aimTol=" + w.aimTolerance.toFixed(3));
      }
      if (report.directHitsTaken >= 3 && report.closeDodges < 3) {
        w.dodgeDist = clamp(Math.round(w.dodgeDist + 16), 150, 240);
        w.preferredRange = clamp(Math.round(w.preferredRange + 22), 180, 340);
        changes.push("raised dodgeDist=" + w.dodgeDist);
      }
      if (report.powerupsCollected === 0) {
        w.powerupGreed = clamp(w.powerupGreed + 0.12, 0.4, 1.25);
        changes.push("boosted powerupGreed=" + w.powerupGreed.toFixed(2));
      }
      if (report.regenUses === 0 && report.damageTaken >= 35) {
        w.regenHpFrac = clamp(w.regenHpFrac + 0.07, 0.55, 0.88);
        changes.push("earlier regen=" + Math.round(w.regenHpFrac * 100) + "%");
      }
      if (!changes.length) {
        w.bankBias = clamp(w.bankBias + (Math.random() - 0.5) * 0.18, 0.25, 0.95);
        changes.push("explored bankBias=" + w.bankBias.toFixed(2));
      }
    }

    brain.gen = (brain.gen || 1) + 1;
    brain.summary = "Gen " + brain.gen + " [" + armName + "]: " + changes.join(", ");
    return brain;
  }
};
