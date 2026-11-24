const BOT = {
  name: "Claude",
  author: "Claude Opus 5.5 (high effort)",
  algorithm: "1. Verified fire control: every tick the bot simulates its own shot along the current chassis angle with maze.traceShot (walls, bounces, special tiles) and walks the path in 7px steps, comparing each bullet point with every enemy's predicted position at that flight time. It only pulls the trigger when that simulated bullet meets an enemy, so it never wastes one of its 3 rounds, and it fires opportunistically whenever a bounce happens to line up. 2. Aiming: turns the fixed cannon toward a velocity-led intercept point; if the full lead point is behind a wall it tries 75/50/25 percent lead. 3. Bank shots: when the target is hidden, it sweeps 72 angles and keeps the ones whose simulated path reaches the target within 1.6s, preferring small turns and short flights; the shot is re-verified from the exact current angle before firing. 4. Dodging: closest-point-of-approach test on enemy bullets up to 1.4s ahead; escapes perpendicular, driving forward or in reverse (whichever turns less), toward the side with more wall clearance. 5. Cover: with an empty magazine and an enemy in sight it drives (reversing if needed) to the nearest nearby point the enemy cannot see. 6. Range control and weaving while engaged, cached A* navigation, LiDAR front-wall guard, anti-stuck, trap avoidance, power-up detours, regen out of sight. 7. Learning: onMatchEnd adjusts preferred range, lead and aim margin from accuracy, damage taken and wins.",
  thoughts: "Bullets are slow (225px/s) and magazines tiny (3 rounds, 1.5s each), so the fights are won by not missing and not standing still. Rather than trusting an aim tolerance, the bot asks the engine's own ricochet tracer whether this exact shot will connect, which also turns every wall into a potential bank shot for free. Between shots it keeps moving, sidesteps bullets early, and breaks line of sight to reload. Learning is conservative so one unlucky match cannot wreck the policy.",

  think(state) {
    const me = state.me, maze = state.maze, rules = state.rules, mem = state.memory, brain = state.brain;
    const PI = Math.PI, TAU = PI * 2, t = state.time;
    const norm = a => { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; };
    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    const R = me.radius || 14;
    const MUZ = rules.muzzleOffset || R + 5;
    const HIT_R = (rules.bulletRadius ? R + rules.bulletRadius : R + 2.6) - 3;

    if (!brain.p) brain.p = { range: 210, lead: 1.0, margin: 0 };
    const P = brain.p;
    if (!P.leg) P.leg = 105;
    if (!mem.init) {
      mem.init = true; mem.lastX = me.x; mem.lastY = me.y; mem.stuckT = t; mem.unstickUntil = 0;
      mem.path = []; mem.pathAt = -9; mem.bankAt = -9; mem.bank = null; mem.lastThrottle = 0; mem.unstickDir = 1;
      mem.cover = null; mem.coverAt = -9;
    }

    const wall = (x, y) => maze.isWall(Math.floor(x / 20), Math.floor(y / 20));
    const free = (x, y) => x > 16 && y > 16 && x < 884 && y < 644 && !wall(x, y) && !wall(x + 12, y) && !wall(x - 12, y) && !wall(x, y + 12) && !wall(x, y - 12);
    const muzzleClear = a => !wall(me.x + Math.cos(a) * (MUZ + 2), me.y + Math.sin(a) * (MUZ + 2));
    const clearance = a => { const r = maze.castRay(me.x, me.y, a, 80); return r && r.hit ? r.dist : 80; };
    const drive = (a, speed, allowRev) => {
      const d = norm(a - me.angle);
      if (allowRev && Math.abs(d) > PI / 2) {
        const d2 = norm(a + PI - me.angle);
        return { throttle: -speed * Math.max(0.3, Math.cos(d2)), turn: clamp(d2 * 3, -1, 1) };
      }
      const th = Math.abs(d) > 1.2 ? 0.12 * speed : speed * Math.max(0.35, Math.cos(d));
      return { throttle: th, turn: clamp(d * 3, -1, 1) };
    };
    const goPath = (gx, gy, allowRev) => {
      if (t - mem.pathAt > 0.35 || !mem.path.length) {
        const p = maze.findPath(me.x, me.y, gx, gy);
        mem.path = Array.isArray(p) ? p.slice() : [];
        mem.pathAt = t;
      }
      while (mem.path.length > 1 && Math.hypot(mem.path[0].x - me.x, mem.path[0].y - me.y) < 18) mem.path.shift();
      const wp = mem.path[0] || { x: gx, y: gy };
      return drive(Math.atan2(wp.y - me.y, wp.x - me.x), 1, allowRev);
    };

    const act = { throttle: 0, turn: 0, fire: false, regen: false, say: "" };
    const buffs = me.buffs || {};
    const wt = buffs.weaponCharges > 0 ? buffs.weaponType : null;
    const bs = rules.bulletSpeed || 225;
    const pspeed = wt === "laser" ? 1e6 : wt === "ultra_ricochet" ? bs * 1.2 : bs;
    const maxR = wt === "laser" ? 650 : wt === "ultra_ricochet" ? 1400 : (rules.maxRange || 550);
    const maxB = wt === "laser" ? 2 : wt === "ultra_ricochet" ? 8 : (rules.maxBounces || 3);
    const enemies = state.enemies.filter(e => !e.reflecting);

    // Simulate a shot at angle ang; returns { id, bounces, tt } for the first enemy it meets, or null.
    const shotHits = (ang, maxTime) => {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const ox = me.x + ca * MUZ, oy = me.y + sa * MUZ;
      let segs;
      if (wt === "penetrate") segs = [{ x1: ox, y1: oy, x2: ox + ca * maxR, y2: oy + sa * maxR, len: maxR, bounceIndex: 0 }];
      else { if (!muzzleClear(ang)) return null; segs = maze.traceShot(ox, oy, ang, maxR, maxB).segments; }
      let trav = 0;
      for (const s of segs) {
        const legStart = s.bounceIndex > 0 ? trav : -1e9;
        const n = Math.max(1, Math.ceil(s.len / 7));
        for (let k = 1; k <= n; k++) {
          const f = k / n, d = trav + s.len * f, tt = d / pspeed;
          if (tt > maxTime) return null;
          const bx = s.x1 + (s.x2 - s.x1) * f, by = s.y1 + (s.y2 - s.y1) * f;
          for (const e of enemies) {
            const ex = e.x + e.vx * tt * P.lead, ey = e.y + e.vy * tt * P.lead;
            if (Math.hypot(bx - ex, by - ey) < HIT_R - P.margin) return { id: e.id, bounces: s.bounceIndex, tt, leg: s.bounceIndex > 0 ? d - legStart : d };
          }
        }
        trav += s.len;
      }
      return null;
    };

    // ---------- target selection ----------
    let target = null, best = -1e9;
    for (const e of state.enemies) {
      const s = (e.visible ? 300 : 0) - e.dist + (e.maxHp - e.hp) * 2 + (e.reloading ? 70 : 0) + (e.stunned ? 90 : 0) - (e.reflecting ? 400 : 0);
      if (s > best) { best = s; target = e; }
    }

    // ---------- aiming ----------
    let aim = null, losT = false, isBank = false;
    if (target) {
      losT = target.visible || maze.hasLineOfSight(me.x, me.y, target.x, target.y);
      if (losT || wt === "penetrate") {
        let px = target.x, py = target.y;
        for (let i = 0; i < 3; i++) {
          const ft = Math.min(2.5, Math.max(0, Math.hypot(px - me.x, py - me.y) - MUZ) / pspeed) * P.lead;
          px = target.x + target.vx * ft; py = target.y + target.vy * ft;
        }
        aim = Math.atan2(target.y - me.y, target.x - me.x);
        for (const k of [1, 0.75, 0.5, 0.25]) {
          const lx = target.x + (px - target.x) * k, ly = target.y + (py - target.y) * k;
          if (wt === "penetrate" || maze.hasLineOfSight(me.x, me.y, lx, ly)) { aim = Math.atan2(ly - me.y, lx - me.x); break; }
        }
        mem.bank = null;
      }
      if (me.ammo > 0 && target.dist < maxR + 80 && !(losT && target.dist < 150)) {
        if (t - mem.bankAt > 0.25) {
          mem.bankAt = t;
          let bestB = null;
          for (let i = 0; i < 72; i++) {
            const ang = me.angle + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (TAU / 72);
            const h = shotHits(ang, 1.6);
            if (!h || h.bounces < 1 || h.leg > P.leg * 1.3) continue;
            const score = Math.abs(norm(ang - me.angle)) / 2.75 + h.tt + h.bounces * 0.15 + h.leg / 160;
            if (!bestB || score < bestB.score) bestB = { ang, score };
          }
          mem.bank = bestB;
        }
        if (mem.bank && (!losT || target.dist > 190)) { aim = mem.bank.ang; isBank = true; }
      }
    }
    if (aim !== null) act.turn = clamp(norm(aim - me.angle) * 5, -1, 1);

    // ---------- verified fire (also catches lucky ricochet lines) ----------
    if (me.fireCooldown <= 0 && me.ammo > 0 && !me.reloading) {
      const h = shotHits(me.angle, me.ammo === 1 ? 1.3 : 2.0);
      const closeEnough = h && (h.leg < P.leg || h.tt < P.leg / 250 || (target && (target.stunned || target.dist < 110)));
      if (closeEnough) { act.fire = true; if (h.bounces > 0) act.say = "BANK SHOT!"; mem.bankAt = -9; }
    }

    // ---------- movement ----------
    // Trace every enemy bullet through its remaining ricochets and find when it passes closest to us.
    const threats = [];
    for (const b of state.bullets) {
      if (b.ownerId === me.id) continue;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      if (Math.hypot(b.x - me.x, b.y - me.y) > sp * 1.5 + 40) continue;
      const left = Math.max(0, (b.maxBounces || 3) - (b.bounces || 0));
      const segs = b.penetrate ? [{ x1: b.x, y1: b.y, x2: b.x + b.vx / sp * b.remainingRange, y2: b.y + b.vy / sp * b.remainingRange, len: b.remainingRange }]
        : maze.traceShot(b.x, b.y, Math.atan2(b.vy, b.vx), Math.min(b.remainingRange, sp * 1.5), left).segments;
      const pts = [];
      let trav = 0;
      for (const s of segs) {
        const n = Math.max(1, Math.ceil(s.len / 8));
        for (let k = 0; k <= n; k++) {
          const f = k / n, tt = (trav + s.len * f) / sp;
          if (tt > 1.5) break;
          pts.push({ x: s.x1 + (s.x2 - s.x1) * f, y: s.y1 + (s.y2 - s.y1) * f, tt });
        }
        trav += s.len;
      }
      threats.push(pts);
    }
    const minMiss = (vx, vy) => {
      let m = 1e9, mt = 9;
      for (const pts of threats) for (const q of pts) {
        const d = Math.hypot(q.x - (me.x + vx * q.tt), q.y - (me.y + vy * q.tt));
        if (d < m) { m = d; mt = q.tt; }
      }
      return { m, mt };
    };
    let dodge = null;
    const still = minMiss(0, 0), moving = minMiss(me.vx || 0, me.vy || 0);
    if (threats.length && Math.min(still.m, moving.m) < R + 18) {
      let bestD = null;
      const spd = rules.codeBotSpeed || 72;
      for (let i = 0; i < 16; i++) {
        const a = i * TAU / 16;
        const fwd = Math.abs(norm(a - me.angle)) <= PI / 2;
        const off = fwd ? Math.abs(norm(a - me.angle)) : Math.abs(norm(a + PI - me.angle));
        const lag = off / 2.75;
        const v = spd * (fwd ? 1 : 0.72);
        const cl = clearance(a);
        const reach = Math.min(cl - R, 70);
        if (reach < 6) continue;
        let m = 1e9;
        for (const pts of threats) for (const q of pts) {
          const tm = Math.max(0, q.tt - lag * 0.6);
          const dd = Math.min(reach, v * tm);
          const d = Math.hypot(q.x - (me.x + Math.cos(a) * dd), q.y - (me.y + Math.sin(a) * dd));
          if (d < m) m = d;
        }
        const sc = Math.min(m, R + 30) - lag * 20;
        if (!bestD || sc > bestD.sc) bestD = { a, sc };
      }
      if (bestD) dodge = { a: bestD.a };
    }

    let trap = null;
    for (const tr of state.traps) if (tr.ownerId !== me.id && tr.dist < 48) { trap = tr; break; }

    const exposed = target && losT && target.dist < 600;
    const empty = me.ammo === 0 || me.reloading;

    let mv, keepAim = false;
    if (dodge) {
      mv = drive(dodge.a, 1, true);
    } else if (trap) {
      mv = drive(Math.atan2(me.y - trap.y, me.x - trap.x), 1, true);
    } else if (exposed && (empty || (!isBank && target.dist > 230 && !target.stunned))) {
      if (t - mem.coverAt > 0.4 || !mem.cover) {
        mem.coverAt = t; mem.cover = null;
        let bd = 1e9;
        for (let i = 0; i < 16; i++) {
          const a = i * TAU / 16;
          for (const r of [45, 85, 125]) {
            const x = me.x + Math.cos(a) * r, y = me.y + Math.sin(a) * r;
            if (!free(x, y) || !maze.hasLineOfSight(me.x, me.y, x, y) || maze.hasLineOfSight(target.x, target.y, x, y)) continue;
            const d = r + Math.max(0, 140 - Math.hypot(x - target.x, y - target.y)) * 2;
            if (d < bd) { bd = d; mem.cover = { x, y }; }
          }
        }
      }
      if (mem.cover) mv = drive(Math.atan2(mem.cover.y - me.y, mem.cover.x - me.x), 1, true);
      else { mv = { throttle: -0.9, turn: act.turn }; keepAim = true; }
    } else if (target && aim !== null && !isBank && losT) {
      const d = target.dist;
      keepAim = true;
      if (d < P.range - 60) mv = { throttle: -0.7, turn: act.turn };
      else if (d > P.range + 80) { mv = goPath(target.x, target.y, false); keepAim = Math.abs(norm(aim - me.angle)) < 0.35; }
      else mv = { throttle: 0.55 * Math.sin(t * 2.6), turn: act.turn };
    } else if (isBank) {
      mv = { throttle: 0.2 * Math.sin(t * 3), turn: act.turn };
      keepAim = true;
    } else {
      let goal = target ? { x: target.x, y: target.y } : { x: 450, y: 330 };
      const valuable = { laser: 3, reflect_shield: 2.5, shield: 2.2, penetrate: 2.2, ultra_ricochet: 2, speed: 1.6, piercing: 1.5, trap: 1.2 };
      let bestP = null, bpS = 0;
      for (const p of state.powerups) {
        const s = (valuable[p.type] || 1) * 260 - p.dist;
        if (p.dist < 320 && s > bpS) { bpS = s; bestP = p; }
      }
      if (bestP && (!target || bestP.dist < target.dist * 0.8)) goal = bestP;
      if (target && !bestP && empty) goal = { x: me.x * 2 - target.x, y: me.y * 2 - target.y };
      mv = goPath(clamp(goal.x, 20, 880), clamp(goal.y, 20, 640), false);
    }
    act.throttle = mv.throttle;
    act.turn = keepAim ? act.turn : mv.turn;

    // front-wall guard using LiDAR
    if (act.throttle > 0.2 && state.lidar && state.lidar.length) {
      let front = 999, left = 0, right = 0;
      for (const r of state.lidar) {
        if (Math.abs(r.relAngle) < 0.25) front = Math.min(front, r.dist);
        else if (r.relAngle < 0) left += r.dist; else right += r.dist;
      }
      if (front < R + 12) { act.throttle *= 0.25; if (!keepAim) act.turn = right > left ? 0.8 : -0.8; }
    }

    // anti-stuck
    if (t - mem.stuckT > 0.8) {
      const moved = Math.hypot(me.x - mem.lastX, me.y - mem.lastY);
      if (moved < 8 && Math.abs(mem.lastThrottle) > 0.3) { mem.unstickUntil = t + 0.55; mem.unstickDir = Math.random() < 0.5 ? -1 : 1; }
      mem.lastX = me.x; mem.lastY = me.y; mem.stuckT = t;
    }
    if (t < mem.unstickUntil) { act.throttle = -0.8 * Math.sign(mem.lastThrottle || 1); act.turn = mem.unstickDir; }
    mem.lastThrottle = act.throttle;

    // regen out of sight
    if (me.hp < me.maxHp * 0.82 && me.ammo >= 3 && me.regenCooldown <= 0 && !exposed) act.regen = true;

    act.throttle = clamp(act.throttle || 0, -1, 1);
    act.turn = clamp(act.turn || 0, -1, 1);
    return act;
  },

  onMatchEnd(report, brain) {
    const p = brain.p || { range: 210, lead: 1.0, margin: 0 };
    brain.gen = (brain.gen || 1) + 1;
    brain.wins = (brain.wins || 0) + (report.won ? 1 : 0);
    const acc = Number(report.accuracy) || 0;
    const notes = [];
    if (report.shotsFired >= 4) {
      if (acc < 20) { p.leg = Math.max(70, (p.leg || 105) - 8); notes.push("closer shots"); }
      else if (acc > 40) { p.leg = Math.min(170, (p.leg || 105) + 8); notes.push("longer shots"); }
      if ((report.shotsMissedRange || 0) > (report.shotsMissedWall || 0) + 1) { p.lead = Math.min(1.25, p.lead + 0.03); notes.push("more lead"); }
    }
    if ((report.damageTaken || 0) > (report.damageDealt || 0) + 20) { p.range = Math.min(300, p.range + 15); notes.push("keep distance"); }
    else if (report.won) { p.range = Math.max(150, p.range - 5); notes.push("press harder"); }
    brain.p = p;
    brain.summary = "Gen " + brain.gen + ": " + (report.won ? "won" : "rank " + report.rank) + ", acc " + acc + "% -> " + (notes.join(", ") || "kept policy");
    return brain;
  }
};
