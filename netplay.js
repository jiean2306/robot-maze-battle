/* Maze Bots — Online 1v1 (peer-to-peer, host-authoritative)
 *
 * How it works
 *  - HOST runs the whole match exactly as usual. Slot 2 becomes a "remote" code bot whose
 *    Web Worker is replaced by a network proxy: every ~30 Hz state snapshot is sent to the guest.
 *  - GUEST runs its own bot code in its own local Web Worker (the code never leaves the guest's
 *    computer), and sends the resulting { throttle, turn, fire, regen, say } back to the host.
 *  - The host streams the arena canvas to the guest as live video, plus a small HUD feed.
 *  - Connection: WebRTC via PeerJS (public PeerJS broker only does the initial handshake).
 */
(() => {
  'use strict';

  const PEER_PREFIX = 'mazebots-1v1-';
  const REMOTE_SLOT = 1;                 // host = slot 1 (index 0), friend = slot 2 (index 1)
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  const api = () => window.__MAZE_BOTS__ && window.__MAZE_BOTS__.net;

  const net = {
    role: null,          // 'host' | 'guest' | null
    peer: null,
    conn: null,
    call: null,
    code: '',
    stream: null,
    hudTimer: null,
    // host side
    proxy: null,
    guestInfo: null,
    // guest side
    worker: null,
    guestSlot: -1,
    lastReport: null,
    ticks: 0,
    thinkMs: 0,
  };

  // ---------------------------------------------------------------- helpers
  const clean = (s, n) => String(s == null ? '' : s).replace(/[^\w .\-'!?#+:()]/g, '').trim().slice(0, n);
  const num = (v, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0);
  const connOpen = () => Boolean(net.conn && net.conn.open);
  function send(msg) { if (connOpen()) { try { net.conn.send(msg); } catch (_) {} } }
  function newCode() { let s = ''; for (let i = 0; i < 6; i++) s += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]; return s; }

  // ======================================================================
  // Public hooks used by game.js
  // ======================================================================
  window.MazeNet = {
    isOnlineMatch() {
      const a = api();
      return net.role === 'host' && Boolean(a) && a.isArena() && a.getBots().some(b => b.remote);
    },
    // A Worker-compatible object: postMessage / terminate / onmessage / onerror
    createRemoteWorker(bot) {
      const proxy = {
        onmessage: null,
        onerror: null,
        dead: false,
        postMessage(msg) {
          if (proxy.dead) return;
          if (!connOpen()) {
            setTimeout(() => proxy.emit({ type: 'error', error: 'Friend is not connected' }), 0);
            return;
          }
          if (msg.type === 'init') send({ t: 'init', grid: msg.grid, walkableCenter: msg.walkableCenter, botName: bot.name });
          else if (msg.type === 'tick') send({ t: 'tick', reqId: msg.reqId, state: msg.state });
          else if (msg.type === 'match_end') send({ t: 'match_end', report: msg.report });
        },
        terminate() {
          if (proxy.dead) return;
          proxy.dead = true;
          if (net.proxy === proxy) net.proxy = null;
          send({ t: 'stop' });
        },
        emit(data) { if (!proxy.dead && typeof proxy.onmessage === 'function') proxy.onmessage({ data }); },
      };
      if (net.proxy) net.proxy.dead = true;
      net.proxy = proxy;
      return proxy;
    },
  };

  // ======================================================================
  // HOST
  // ======================================================================
  function startHosting() {
    if (!window.Peer) return setStatus('Could not load the networking library (PeerJS). Check your internet connection.', 'err');
    stopAll();
    net.role = 'host';
    net.code = newCode();
    setStatus('Opening room…');
    renderModal();
    const peer = net.peer = new window.Peer(PEER_PREFIX + net.code, { debug: 1 });
    peer.on('open', () => { setStatus('Room open. Send your friend the code below.', 'ok'); renderModal(); });
    peer.on('connection', conn => {
      if (connOpen()) { conn.on('open', () => { conn.send({ t: 'busy' }); setTimeout(() => conn.close(), 300); }); return; }
      net.conn = conn;
      conn.on('data', hostHandle);
      conn.on('close', () => hostLostGuest());
      conn.on('error', () => hostLostGuest());
    });
    peer.on('error', err => {
      if (err.type === 'unavailable-id') { startHosting(); return; }   // code collision: pick another
      setStatus(`Network error: ${err.type || err.message || err}`, 'err');
    });
    peer.on('disconnected', () => { if (net.role === 'host' && !peer.destroyed) peer.reconnect(); });
  }

  function hostHandle(m) {
    if (!m || typeof m !== 'object') return;
    const a = api();
    switch (m.t) {
      case 'hello': {
        net.guestInfo = { player: clean(m.player, 16) || 'Friend', bot: clean(m.bot, 16) || 'Friend Bot' };
        configureRemoteSlot();
        send({ t: 'welcome', slot: REMOTE_SLOT + 1, code: net.code });
        // live video of the arena canvas for the guest
        try {
          if (!net.stream) {
            net.stream = a.canvas.captureStream(30);
            // crisp pixel art: keep full resolution rather than downscaling
            net.stream.getVideoTracks().forEach(t => { try { t.contentHint = 'detail'; } catch (_) {} });
          }
          net.call = net.peer.call(net.conn.peer, net.stream);
          tuneVideoSender(net.call);
        } catch (_) { /* video is optional; the match still works */ }
        startHudFeed();
        setStatus(`${net.guestInfo.player} joined with “${net.guestInfo.bot}”. Pick your own robot in slot 1, then press Start Battle.`, 'ok');
        renderModal();
        break;
      }
      case 'ready':
        if (net.proxy) net.proxy.emit({ type: 'ready', hasLearner: Boolean(m.hasLearner), meta: {} });
        break;
      case 'action':
        if (net.proxy) net.proxy.emit({
          type: 'action', reqId: m.reqId | 0, elapsedMs: num(m.elapsedMs, 0, 10000),
          action: {
            throttle: num(m.action && m.action.throttle, -1, 1),
            turn: num(m.action && m.action.turn, -1, 1),
            fire: Boolean(m.action && m.action.fire),
            regen: Boolean(m.action && m.action.regen),
            say: clean(m.action && m.action.say, 22),
          },
        });
        break;
      case 'error':
        if (net.proxy) net.proxy.emit({ type: 'error', error: 'Friend’s bot: ' + clean(m.error, 120) });
        break;
      case 'brain_saved':
        // the guest keeps its learned brain on its own computer; host only records the summary
        if (net.proxy) net.proxy.emit({ type: 'brain_saved', brain: {}, summary: clean(m.summary, 180) });
        break;
    }
  }

  function tuneVideoSender(call) {
    const pc = call && call.peerConnection;
    if (!pc || !pc.getSenders) return;
    for (const s of pc.getSenders()) {
      if (!s.track || s.track.kind !== 'video' || !s.getParameters) continue;
      try {
        const p = s.getParameters();
        if (!p.encodings || !p.encodings.length) p.encodings = [{}];
        p.encodings[0].maxBitrate = 3000000;
        p.encodings[0].scaleResolutionDownBy = 1;
        p.degradationPreference = 'maintain-resolution';
        s.setParameters(p).catch(() => {});
      } catch (_) {}
    }
  }

  function configureRemoteSlot() {
    const a = api(); if (!a) return;
    const cfg = a.botConfigs[REMOTE_SLOT];
    const g = net.guestInfo;
    a.botConfigs.forEach(c => { c.remote = false; });
    if (a.botConfigs[0].role === 'p2') a.botConfigs[0].role = 'p1';
    cfg.role = 'code';
    cfg.remote = true;
    cfg.name = g.bot;
    cfg.codeAuthor = `Online · ${g.player}`;
    cfg.codeAlgorithm = `This robot's code runs on ${g.player}'s computer. Only its controls (throttle, turn, fire) are sent over the network.`;
    cfg.codeThoughts = 'Remote bot — source code stays private on the other computer.';
    cfg.codeSource = `const BOT = {\n  name: ${JSON.stringify(g.bot)},\n  author: ${JSON.stringify('Online · ' + g.player)},\n  algorithm: "Runs on your friend's computer (online 1v1).",\n  thoughts: "Source code stays on the remote computer.",\n  think() { return { throttle: 0, turn: 0, fire: false }; }\n};`;
    cfg.codeValid = true;
    cfg.codeError = '';
    a.setBotCount(2);
  }

  function hostLostGuest() {
    if (net.role !== 'host') return;
    const who = net.guestInfo ? net.guestInfo.player : 'Your friend';
    if (net.proxy) net.proxy.emit({ type: 'error', error: `${who} disconnected` });
    net.conn = null;
    if (net.call) { try { net.call.close(); } catch (_) {} net.call = null; }
    stopHudFeed();
    net.guestInfo = null;
    setStatus(`${who} left. The room is still open — they can rejoin with the same code.`, 'warn');
    renderModal();
  }

  function startHudFeed() {
    stopHudFeed();
    net.hudTimer = setInterval(() => {
      const a = api(); if (!a || !connOpen()) return;
      const bots = a.getBots();
      send({
        t: 'hud',
        arena: a.isArena(),
        over: a.isMatchOver(),
        time: a.matchTime(),
        bots: a.isArena() ? bots.map(b => ({
          name: b.name, color: b.color, hp: b.hp, maxHp: b.maxHp, ammo: b.ammo, maxAmmo: b.maxAmmo,
          alive: b.alive, kills: b.kills, remote: Boolean(b.remote), state: b.stateLabel,
        })) : [],
        feed: a.isArena() ? a.feed().map(f => `[${f.time}] ${f.text}`) : [],
      });
    }, 200);
  }
  function stopHudFeed() { if (net.hudTimer) clearInterval(net.hudTimer); net.hudTimer = null; }

  // ======================================================================
  // GUEST
  // ======================================================================
  // ---------------------------------------------------------------- bot picker
  // choice: 'keep' | 'slot:<i>' | 'sample:<id>' | 'file'
  function botChoiceOptions(includeKeep) {
    const a = api(); if (!a) return '';
    const opts = [];
    if (includeKeep) opts.push(['keep', 'Keep my current slot 1 setup']);
    const samples = a.samples().slice().sort((x, y) => (y.id === 'opus-5-5-high') - (x.id === 'opus-5-5-high'));
    for (const s of samples) opts.push(['sample:' + s.id, 'Built-in: ' + s.label.replace(/^Example \d+:\s*/, '')]);
    a.botConfigs.forEach((c, i) => { if (c.role === 'code' && !c.remote) opts.push(['slot:' + i, `My Code slot ${i + 1}: ${c.name}`]); });
    opts.push(['file', 'Load a .js bot file…']);
    return opts.map(([v, l]) => `<option value="${v}">${String(l).replace(/[<>&"]/g, '')}</option>`).join('');
  }

  function sampleRobotName(s) {
    if (s.id === 'opus-5-5-high') return 'Opus 5.5 High';
    const m = s.source.match(/name:\s*"([^"]{1,18})"/);
    return m ? m[1] : 'Code Bot';
  }

  function loadIntoSlot(slotIdx, source, name) {
    const a = api();
    const cfg = a.botConfigs[slotIdx];
    cfg.role = 'code';
    cfg.remote = false;
    cfg.codeSource = source;
    cfg.name = clean(name, 16) || cfg.name;
    const pick = re => { const m = source.match(re); return m ? m[1].replace(/\\n/g, '\n') : ''; };
    cfg.codeAuthor = pick(/author:\s*"((?:[^"\\]|\\.)*)"/) || 'Custom AI';
    cfg.codeAlgorithm = pick(/algorithm:\s*"((?:[^"\\]|\\.)*)"/);
    cfg.codeThoughts = pick(/thoughts:\s*"((?:[^"\\]|\\.)*)"/);
    cfg.codeValid = true;
    cfg.codeError = '';
    a.renderSetupCards();
  }

  // Resolves a picker choice into a Code slot; returns the slot index or -1
  function applyBotChoice(choice, slotIdx, fileInput) {
    const a = api();
    if (choice === 'keep') return Promise.resolve(slotIdx);
    if (choice.startsWith('slot:')) return Promise.resolve(Number(choice.slice(5)));
    if (choice.startsWith('sample:')) {
      const s = a.samples().find(x => x.id === choice.slice(7));
      if (!s) return Promise.resolve(-1);
      loadIntoSlot(slotIdx, s.source, sampleRobotName(s));
      return Promise.resolve(slotIdx);
    }
    if (choice === 'file') {
      const f = fileInput && fileInput.files && fileInput.files[0];
      if (!f) { setStatus('Choose a .js bot file first.', 'err'); return Promise.resolve(-1); }
      if (f.size > 300000) { setStatus('That file is too big for a bot (max 300 KB).', 'err'); return Promise.resolve(-1); }
      return f.text().then(txt => {
        if (!/BOT\s*=|function\s+think/.test(txt)) { setStatus('That file does not look like a bot (no const BOT = { think(state) }).', 'err'); return -1; }
        loadIntoSlot(slotIdx, txt, f.name.replace(/\.js$/i, ''));
        return slotIdx;
      });
    }
    return Promise.resolve(-1);
  }

  function joinRoom(code, slotIdx, player) {
    if (!window.Peer) return setStatus('Could not load the networking library (PeerJS). Check your internet connection.', 'err');
    const a = api();
    const cfg = a.botConfigs[slotIdx];
    if (!cfg || cfg.role !== 'code' || !cfg.codeSource) return setStatus('Pick a robot slot that is set to Code mode with your bot loaded.', 'err');
    code = clean(code, 12).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 4) return setStatus('Enter the room code your friend gave you.', 'err');
    stopAll();
    net.role = 'guest';
    net.code = code;
    net.guestSlot = slotIdx;
    net.player = clean(player, 16) || 'Guest';
    setStatus('Connecting…');
    const peer = net.peer = new window.Peer({ debug: 1 });
    peer.on('open', () => {
      const conn = net.conn = peer.connect(PEER_PREFIX + code, { reliable: true });
      conn.on('open', () => {
        send({ t: 'hello', player: net.player, bot: cfg.name });
        openGuestView();
        setStatus('Connected! Waiting for the host to start the battle…', 'ok');
      });
      conn.on('data', guestHandle);
      conn.on('close', () => guestLostHost());
      conn.on('error', () => guestLostHost());
    });
    peer.on('call', call => {
      net.call = call;
      call.answer();
      call.on('stream', s => {
        const v = document.getElementById('net-video');
        if (v) { v.srcObject = s; v.play().catch(() => {}); v.closest('.net-video-wrap').classList.add('live'); }
      });
    });
    peer.on('error', err => {
      if (err.type === 'peer-unavailable') setStatus(`No room found with code ${code}. Check the code and that your friend is hosting.`, 'err');
      else setStatus(`Network error: ${err.type || err.message || err}`, 'err');
      if (net.role === 'guest' && !connOpen()) closeGuestView();
    });
  }

  function guestHandle(m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'welcome': guestStatus(`You are robot slot ${m.slot | 0} in room ${clean(m.code, 8)}. Waiting for the host to start…`); break;
      case 'busy': setStatus('That room already has a player.', 'err'); stopAll(); closeGuestView(); break;
      case 'init': startGuestWorker(m); break;
      case 'tick':
        if (net.worker && net.workerReady) net.worker.postMessage({ type: 'tick', reqId: m.reqId, state: m.state });
        break;
      case 'match_end':
        net.lastReport = m.report;
        if (net.worker) net.worker.postMessage({ type: 'match_end', report: m.report });
        break;
      case 'stop': stopGuestWorker(); break;
      case 'hud': renderGuestHud(m); break;
    }
  }

  function startGuestWorker(m) {
    stopGuestWorker();
    const a = api();
    const cfg = a.botConfigs[net.guestSlot];
    const source = a.stripCodeFences(cfg.codeSource);
    const brain = a.loadBrain(cfg.id, cfg.name).data;
    let w;
    try { w = new Worker(a.getWorkerUrl()); }
    catch (err) { send({ t: 'error', error: 'Could not start Web Worker on guest' }); return; }
    net.worker = w; net.workerReady = false; net.ticks = 0; net.thinkMs = 0;
    w.onmessage = ev => {
      const d = ev.data || {};
      if (d.type === 'ready') { net.workerReady = true; send({ t: 'ready', hasLearner: d.hasLearner }); guestStatus('Battle live — your bot is thinking on this computer.'); }
      else if (d.type === 'action') { net.ticks++; net.thinkMs += d.elapsedMs || 0; send({ t: 'action', reqId: d.reqId, elapsedMs: d.elapsedMs, action: d.action }); }
      else if (d.type === 'error') { send({ t: 'error', error: d.error }); guestStatus('Your bot crashed: ' + d.error, true); }
      else if (d.type === 'brain_saved') {
        try { a.saveBrain(cfg.id, cfg.name, d.brain, net.lastReport || {}); } catch (_) {}
        send({ t: 'brain_saved', summary: d.summary || '' });
      }
    };
    w.onerror = err => { send({ t: 'error', error: err.message || 'Worker error' }); };
    w.postMessage({ type: 'init', source, grid: m.grid, walkableCenter: m.walkableCenter, brain });
  }

  function stopGuestWorker() {
    if (net.worker) { try { net.worker.terminate(); } catch (_) {} }
    net.worker = null; net.workerReady = false;
  }

  function guestLostHost() {
    if (net.role !== 'guest') return;
    stopGuestWorker();
    guestStatus('Disconnected from the host.', true);
    setStatus('Disconnected from the host.', 'warn');
    net.conn = null;
  }

  // ======================================================================
  // Teardown
  // ======================================================================
  function stopAll() {
    stopHudFeed();
    stopGuestWorker();
    if (net.proxy) { net.proxy.emit({ type: 'error', error: 'Online session ended' }); net.proxy.dead = true; net.proxy = null; }
    if (net.call) { try { net.call.close(); } catch (_) {} }
    if (net.conn) { try { net.conn.close(); } catch (_) {} }
    if (net.peer) { try { net.peer.destroy(); } catch (_) {} }
    const a = api();
    if (net.role === 'host' && a) {
      const cfg = a.botConfigs[REMOTE_SLOT];
      if (cfg.remote) { cfg.remote = false; cfg.role = 'ai'; a.renderSetupCards(); }
    }
    Object.assign(net, { role: null, peer: null, conn: null, call: null, code: '', proxy: null, guestInfo: null });
  }

  // ======================================================================
  // UI
  // ======================================================================
  let modal, statusEl;

  function buildUi() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btn-online';
    btn.className = 'btn btn-secondary btn-online';
    btn.title = 'Play a 1v1 against a friend’s AI running on their own computer';
    btn.textContent = 'Online 1v1';
    const start = document.getElementById('btn-start-battle');
    if (start && start.parentNode) start.parentNode.insertBefore(btn, start);
    btn.addEventListener('click', () => { modal.classList.remove('hidden'); renderModal(); });

    modal = document.createElement('div');
    modal.id = 'net-modal';
    modal.className = 'modal-backdrop hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="modal-dialog net-dialog">
        <div class="modal-header">
          <div><h3>Online 1v1 — AI vs AI</h3>
          <p class="modal-sub">Each robot's code runs on its owner's computer. The host runs the arena; the guest's bot gets the same state snapshots and sends back its controls.</p></div>
          <button type="button" class="modal-close" data-net="close" aria-label="Close">×</button>
        </div>
        <div class="modal-body net-body"></div>
        <div class="modal-footer"><span class="modal-status net-status" id="net-status">Not connected</span></div>
      </div>`;
    document.body.appendChild(modal);
    statusEl = modal.querySelector('#net-status');
    modal.addEventListener('click', e => {
      const t = e.target.closest('[data-net]');
      if (e.target === modal) return modal.classList.add('hidden');
      if (!t) return;
      const act = t.dataset.net;
      if (act === 'close') modal.classList.add('hidden');
      else if (act === 'host') startHosting();
      else if (act === 'stop') { stopAll(); setStatus('Online session ended.'); renderModal(); }
      else if (act === 'copy') { navigator.clipboard && navigator.clipboard.writeText(net.code).then(() => setStatus('Room code copied!', 'ok')); }
      else if (act === 'join') {
        const code = modal.querySelector('#net-code').value, player = modal.querySelector('#net-player').value;
        applyBotChoice(modal.querySelector('#net-bot').value, 0, modal.querySelector('#net-file'))
          .then(idx => { if (idx >= 0) joinRoom(code, idx, player); });
      }
      else if (act === 'hostbot') {
        const sel = modal.querySelector('#net-hostbot');
        applyBotChoice(sel.value, 0, modal.querySelector('#net-hostfile')).then(idx => {
          if (idx >= 0) setStatus(`Robot slot 1 is now “${api().botConfigs[0].name}”.`, 'ok');
        });
      }
    });
    // show the file chooser only when "Load a .js bot file…" is picked
    modal.addEventListener('change', e => {
      const sel = e.target.closest('select[data-file]');
      if (!sel) return;
      const f = modal.querySelector('#' + sel.dataset.file);
      if (f) f.classList.toggle('hidden', sel.value !== 'file');
    });

    // guest live view
    const view = document.createElement('div');
    view.id = 'net-guest-view';
    view.className = 'net-guest-view hidden';
    view.innerHTML = `
      <div class="net-guest-inner">
        <div class="net-guest-head">
          <div><span class="net-live-dot"></span><strong>Online 1v1</strong> <span id="net-guest-room"></span></div>
          <button type="button" class="btn btn-secondary" id="net-leave">Leave match</button>
        </div>
        <p class="net-guest-status" id="net-guest-status">Connecting…</p>
        <div class="net-guest-main">
          <div class="net-video-wrap"><video id="net-video" autoplay playsinline muted></video><div class="net-video-wait">Waiting for the host's arena video…</div></div>
          <aside class="net-guest-side"><div id="net-guest-bots"></div><ul id="net-guest-feed" class="net-guest-feed"></ul>
          <p class="net-guest-perf" id="net-guest-perf"></p></aside>
        </div>
      </div>`;
    document.body.appendChild(view);
    view.querySelector('#net-leave').addEventListener('click', () => { stopAll(); closeGuestView(); setStatus('You left the match.'); });
  }

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = 'modal-status net-status' + (kind ? ' ' + kind : '');
  }

  function renderModal() {
    const body = modal.querySelector('.net-body');
    const a = api();
    if (net.role === 'host') {
      const g = net.guestInfo;
      body.innerHTML = `
        <div class="net-card">
          <h4>You are hosting</h4>
          <p>Send this room code to your friend. They open the same game page, load their bot into a Code slot, press <b>Online 1v1 → Join</b>, and enter it.</p>
          <div class="net-code-row"><span class="net-code">${net.peer && net.peer.open ? net.code : '······'}</span>
            <button type="button" class="btn btn-secondary" data-net="copy">Copy code</button></div>
          <p class="net-guest-line">${g ? `✅ <b>${g.player}</b> is connected — their bot <b>${g.bot}</b> is in robot slot 2.` : '⏳ Waiting for your friend to join…'}</p>
          <label class="net-field"><span>Your robot (slot 1)</span><select id="net-hostbot" data-file="net-hostfile">${botChoiceOptions(true)}</select></label>
          <input type="file" id="net-hostfile" class="net-file hidden" accept=".js,.txt,text/javascript">
          <button type="button" class="btn btn-secondary" data-net="hostbot">Use this robot</button>
          <ol class="net-steps"><li>Pick <b>your robot</b> above (or set slot 1 to any AI / Code bot on the setup screen).</li><li>Wait for your friend to connect (slot 2 fills in automatically).</li><li>Close this window and press <b>Start Battle</b>. Online matches always run at 1× speed.</li></ol>
          <button type="button" class="btn btn-secondary" data-net="stop">Stop hosting</button>
        </div>`;
      return;
    }
    body.innerHTML = `
      <div class="net-grid">
        <div class="net-card">
          <h4>Host a match</h4>
          <p>Your computer runs the arena. Your friend's bot joins as robot slot 2 and you play AI vs AI.</p>
          <button type="button" class="btn btn-primary" data-net="host">Create room</button>
        </div>
        <div class="net-card">
          <h4>Join a friend</h4>
          <label class="net-field"><span>Room code</span><input id="net-code" maxlength="8" placeholder="e.g. K7QM2D" autocomplete="off"></label>
          <label class="net-field"><span>Your name</span><input id="net-player" maxlength="16" placeholder="Player"></label>
          <label class="net-field"><span>Your bot</span><select id="net-bot" data-file="net-file">${botChoiceOptions(false)}</select></label>
          <input type="file" id="net-file" class="net-file hidden" accept=".js,.txt,text/javascript">
          <button type="button" class="btn btn-primary" data-net="join">Join match</button>
        </div>
      </div>`;
  }

  function openGuestView() {
    const v = document.getElementById('net-guest-view');
    v.classList.remove('hidden');
    v.querySelector('#net-guest-room').textContent = `· room ${net.code}`;
    modal.classList.add('hidden');
  }
  function closeGuestView() {
    const v = document.getElementById('net-guest-view');
    if (!v) return;
    v.classList.add('hidden');
    const vid = document.getElementById('net-video');
    if (vid) { vid.srcObject = null; vid.closest('.net-video-wrap').classList.remove('live'); }
  }
  function guestStatus(text, bad) {
    const el = document.getElementById('net-guest-status');
    if (el) { el.textContent = text; el.classList.toggle('bad', Boolean(bad)); }
  }

  function renderGuestHud(m) {
    const box = document.getElementById('net-guest-bots');
    if (!box) return;
    const bots = Array.isArray(m.bots) ? m.bots : [];
    if (!m.arena) {
      box.innerHTML = '<p class="net-muted">Host is on the setup screen…</p>';
    } else {
      box.innerHTML = bots.map(b => {
        const hp = Math.max(0, Math.round(num(b.hp, 0, 9999)));
        const max = Math.max(1, num(b.maxHp, 1, 9999));
        const color = /^#[0-9a-f]{3,8}$/i.test(b.color) ? b.color : '#64748b';
        return `<div class="net-bot ${b.alive ? '' : 'dead'}" style="--c:${color}">
          <div class="net-bot-top"><b>${clean(b.name, 18)}</b>${b.remote ? '<span class="net-you">YOU</span>' : ''}<span class="net-kills">${num(b.kills, 0, 99)} K</span></div>
          <div class="net-hp"><i style="width:${Math.round(hp / max * 100)}%"></i></div>
          <div class="net-bot-sub">${hp} HP · ammo ${num(b.ammo, 0, 99)}/${num(b.maxAmmo, 0, 99)} · ${clean(b.state, 20)}</div></div>`;
      }).join('');
    }
    const feed = document.getElementById('net-guest-feed');
    if (feed) feed.innerHTML = (Array.isArray(m.feed) ? m.feed : []).map(f => `<li>${clean(f, 90)}</li>`).join('');
    if (m.arena && m.over) {
      const me = bots.find(b => b.remote);
      const alive = bots.filter(b => b.alive);
      const won = me && alive.length === 1 && alive[0].remote;
      guestStatus(won ? '🏆 Your bot won! Waiting for the host to start the next match…' : 'Match over — waiting for the next one…');
    }
    const perf = document.getElementById('net-guest-perf');
    if (perf) perf.textContent = net.ticks ? `Your bot: ${net.ticks} decisions, avg ${(net.thinkMs / net.ticks).toFixed(2)} ms think time` : '';
  }

  // ---------------------------------------------------------------- boot
  function boot() {
    if (!api()) return setTimeout(boot, 50);
    buildUi();
    window.addEventListener('beforeunload', stopAll);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  // debug / test access
  window.MazeNet._state = net;
})();
