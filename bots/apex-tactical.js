const BOT = {
  name: "Apex-JS",
  author: "Sample · Lead Hunter",
  algorithm: "1. Threat Scan & Dodge: Inspects all incoming enemy bullets within 170px using perpendicular miss distance and closing time; if a bullet will hit within 1.1s, reverses or turns perpendicular with LiDAR clearance check.\n2. Pathfinding Pursuit: Uses state.maze.findPath() to navigate corridor centers toward the lowest-HP / closest enemy while avoiding wall snags.\n3. Fixed-Forward Lead Aiming: Predicts enemy position (pos + vel * flightTime), verifies clear line of sight, slows down slightly to align chassis tightly (< 0.08 rad), and conserves the last bullet unless within 270px or enemy is low HP.",
  thoughts: "Because every bot has a fixed-forward cannon and only 3 bullets reloading at 1.5s each, spraying shots is fatal — you get caught empty while reloading. I designed Apex-JS to treat ammo as a scarce resource: navigate aggressively with A*, align the chassis smoothly onto a velocity-predicted lead point, and only pull the trigger when hit probability is high.",
  think(state) {
    const { me, enemies, bullets, maze, rules, memory } = state;
    const norm = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
    const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

    // 1. Dodge incoming bullets
    for (const b of bullets) {
      if (b.ownerId === me.id) continue;
      const rx = me.x - b.x, ry = me.y - b.y;
      const d = Math.hypot(rx, ry);
      if (d > 175 || d < 1) continue;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const dx = b.vx / sp, dy = b.vy / sp;
      const along = rx * dx + ry * dy;
      if (along < 0 || along / sp > 1.15) continue;
      const perp = rx * (-dy) + ry * dx;
      if (Math.abs(perp) < me.radius + 20 && maze.hasLineOfSight(b.x, b.y, me.x, me.y)) {
        const escapeAngle = Math.atan2(dx * (perp >= 0 ? 1 : -1), -dy * (perp >= 0 ? 1 : -1));
        const diff = norm(escapeAngle - me.angle);
        return { throttle: Math.abs(diff) > 1.6 ? -1 : 1, turn: Math.max(-1, Math.min(1, diff * 2.5)), fire: false, say: "DODGING!" };
      }
    }

    if (!enemies.length) return { throttle: 0.4, turn: 0.5, fire: false };

    // 2. Pick best target (visible + low HP weighted)
    let target = enemies[0];
    let bestScore = -1e9;
    for (const e of enemies) {
      const s = (e.visible ? 160 : 0) - e.dist + (rules.maxHp - e.hp) * 2.2;
      if (s > bestScore) { bestScore = s; target = e; }
    }

    // 3. If empty ammo, back off cleanly
    if (me.ammo === 0) {
      const away = Math.atan2(me.y - target.y, me.x - target.x);
      const diff = norm(away - me.angle);
      return { throttle: 0.9, turn: Math.max(-1, Math.min(1, diff * 2.2)), fire: false };
    }

    // 4. Direct LOS lead shot
    if (target.visible) {
      const flight = Math.min(1.4, target.dist / rules.bulletSpeed);
      const px = target.x + target.vx * flight * 0.82;
      const py = target.y + target.vy * flight * 0.82;
      const aimAngle = Math.atan2(py - me.y, px - me.x);
      const err = norm(aimAngle - me.angle);
      const clear = maze.hasLineOfSight(me.x, me.y, px, py);
      const maxShootDist = me.ammo === 1 ? (target.hp <= rules.bulletDamage * 2 ? 430 : 270) : 390;

      if (clear && target.dist <= maxShootDist && me.fireCooldown <= 0.35) {
        const readyToFire = Math.abs(err) < 0.08 && me.fireCooldown <= 0;
        return {
          throttle: target.dist < 105 ? -0.4 : (Math.abs(err) < 0.35 ? 0.65 : 0.15),
          turn: Math.max(-1, Math.min(1, err * 3.2)),
          fire: readyToFire,
          say: readyToFire && me.ammo === 1 ? "LAST SHOT!" : undefined
        };
      }
    }

    // 5. Navigate via built-in A* pathfinder
    if (!memory.path || !memory.path.length || state.time - (memory.pathAt || 0) > 0.45) {
      memory.path = maze.findPath(me.x, me.y, target.x, target.y);
      memory.pathAt = state.time;
    }
    while (memory.path.length > 1 && dist(me.x, me.y, memory.path[0].x, memory.path[0].y) < 22) {
      memory.path.shift();
    }
    const wp = memory.path[0] || target;
    const steer = norm(Math.atan2(wp.y - me.y, wp.x - me.x) - me.angle);
    return {
      throttle: Math.abs(steer) > 1.3 ? 0.2 : 1.0,
      turn: Math.max(-1, Math.min(1, steer * 2.6)),
      fire: false
    };
  }
};
