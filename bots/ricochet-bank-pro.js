const BOT = {
  name: "Prism-JS",
  author: "Sample · Ricochet Math",
  algorithm: "1. 1-Bounce Ray Solver: Sweeps 36 angles using state.maze.castRay() and mirrors each wall hit across the wall normal to find real bank shots around corners — prioritizing bounces off central reinforced pillars (isPillar) for the +15% damage & +8% speed boost!\n2. Safe Corner Holding: When a bank shot is found while out of enemy line of sight, brakes and rotates the chassis cleanly onto the reflection angle to strike without taking return fire.\n3. Fallback A* Hunting: Advances toward mid-range corners around enemies when no bank shot is available.",
  thoughts: "Direct corridor duels trade HP 1-for-1, which is risky in a 4-bot battle. By exploiting the arena's up-to-3 wall bounce physics and reinforced central pillar supercharge, Prism-JS can deal damage around cover while staying completely shielded from direct enemy sightlines.",
  think(state) {
    const { me, enemies, maze, rules, memory } = state;
    const norm = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
    if (!enemies.length) return { throttle: 0.3, turn: 0.4, fire: false };

    const target = enemies.reduce((a, b) => (a.dist < b.dist ? a : b));

    // Probe for a 1-bounce bank shot every 0.18s
    if (me.ammo > 0 && state.time - (memory.probeAt || 0) > 0.18) {
      memory.probeAt = state.time;
      memory.bankAngle = null;
      memory.bankPillar = false;
      const steps = 36;
      let bestScore = -1e9;
      for (let i = 0; i < steps; i++) {
        const ang = (i / steps) * Math.PI * 2;
        const h1 = maze.castRay(me.x, me.y, ang, Math.min(340, rules.maxRange - 60));
        if (!h1.hit || h1.dist < 22) continue;
        const dx = Math.cos(ang), dy = Math.sin(ang);
        const rdx = h1.nx !== 0 ? -dx : dx;
        const rdy = h1.ny !== 0 ? -dy : dy;
        const rAng = Math.atan2(rdy, rdx);
        const rem = rules.maxRange - h1.dist - 20;
        const h2 = maze.castRay(h1.x + h1.nx, h1.y + h1.ny, rAng, rem);

        for (const e of enemies) {
          const ex = e.x - h1.x, ey = e.y - h1.y;
          const proj = ex * rdx + ey * rdy;
          if (proj < 10 || proj > h2.dist) continue;
          const perp = Math.abs(ex * (-rdy) + ey * rdx);
          if (perp < me.radius + 7) {
            const sc = (h1.isPillar ? 220 : 120) - (h1.dist + proj) * 0.25 + (!e.visible ? 90 : 0);
            if (sc > bestScore) {
              bestScore = sc;
              memory.bankAngle = ang;
              memory.bankPillar = h1.isPillar;
            }
          }
        }
      }
    }

    // Execute bank shot if found!
    if (me.ammo > 0 && memory.bankAngle !== null && (!target.visible || memory.bankPillar)) {
      const err = norm(memory.bankAngle - me.angle);
      const fire = Math.abs(err) < 0.065 && me.fireCooldown <= 0;
      return {
        throttle: 0.05,
        turn: Math.max(-1, Math.min(1, err * 3.5)),
        fire,
        say: fire ? (memory.bankPillar ? "PILLAR BOOST!" : "CALCULATED!") : undefined
      };
    }

    // Direct shot if visible & in safe range
    if (me.ammo > 0 && target.visible && target.dist < 380) {
      const aim = Math.atan2(target.y - me.y, target.x - me.x);
      const err = norm(aim - me.angle);
      const fire = Math.abs(err) < 0.075 && me.fireCooldown <= 0 && (me.ammo >= 2 || target.dist < 250);
      return {
        throttle: target.dist < 140 ? -0.6 : 0.35,
        turn: Math.max(-1, Math.min(1, err * 3.0)),
        fire
      };
    }

    // Move toward target via A*
    if (!memory.path || !memory.path.length || state.time - (memory.pathAt || 0) > 0.5) {
      memory.path = maze.findPath(me.x, me.y, target.x, target.y);
      memory.pathAt = state.time;
    }
    while (memory.path.length > 1 && Math.hypot(memory.path[0].x - me.x, memory.path[0].y - me.y) < 22) {
      memory.path.shift();
    }
    const wp = memory.path[0] || target;
    const steer = norm(Math.atan2(wp.y - me.y, wp.x - me.x) - me.angle);
    return {
      throttle: Math.abs(steer) > 1.2 ? 0.2 : 0.9,
      turn: Math.max(-1, Math.min(1, steer * 2.5)),
      fire: false
    };
  }
};
