// Tidewarden rules: a tower defence where the sea rises and falls. No drawing happens here, so it can be tested.
import { Rng, clamp, dist } from "./gamekit.js";

export const COLS = 9, ROWS = 13, CELL = 40;
export const LAND = 0, SHORE = 1, ROAD = 2, SEA = 3, ROCK = 4;
export const LEVELS = 30;

export const TOWERS = {
  bolt: { name: "Bolt", cost: 50, dmg: 9, range: 90, rate: 1.6, color: "#fbbf24", unlock: 0, about: "Fast single shots" },
  cannon: { name: "Cannon", cost: 90, dmg: 18, range: 84, rate: 0.6, splash: 44, color: "#f97316", unlock: 0, about: "Splash damage" },
  brine: { name: "Brine", cost: 70, dmg: 4, range: 80, rate: 1.0, slow: 0.55, color: "#2dd4bf", unlock: 2, about: "Slows raiders" },
  harpoon: { name: "Harpoon", cost: 110, dmg: 26, range: 150, rate: 0.5, boat: 2.2, color: "#a78bfa", unlock: 4, about: "Long range, tears boats" },
  mill: { name: "Tide Mill", cost: 80, dmg: 0, range: 0, rate: 0, gold: 16, color: "#4ade80", unlock: 6, shoreOnly: true, about: "Shore only. Gold each high tide" },
  light: { name: "Lighthouse", cost: 100, dmg: 0, range: 95, rate: 0, color: "#fef08a", unlock: 8, about: "Reveals mist, speeds neighbours" },
};
export const ORDER = Object.keys(TOWERS);
export const MAX_LEVEL = 3;

export const ENEMIES = {
  raider: { name: "Raider", hp: 34, speed: 34, reward: 5, cost: 1, color: "#fca5a5" },
  runner: { name: "Runner", hp: 22, speed: 62, reward: 5, cost: 1, color: "#fde047", from: 1 },
  crab: { name: "Crab", hp: 42, speed: 38, reward: 7, cost: 2, color: "#fb923c", amphibious: true, from: 2 },
  brute: { name: "Brute", hp: 110, speed: 25, armor: 4, reward: 12, cost: 3, color: "#94a3b8", from: 3 },
  boat: { name: "Longboat", hp: 90, speed: 44, reward: 12, cost: 3, color: "#60a5fa", boat: true, from: 2 },
  shaman: { name: "Shaman", hp: 60, speed: 30, heals: 10, reward: 11, cost: 3, color: "#d946ef", from: 5 },
  mist: { name: "Mistwalker", hp: 50, speed: 44, mist: true, reward: 10, cost: 3, color: "#cbd5e1", from: 8 },
  warlord: { name: "Warlord", hp: 620, speed: 21, armor: 8, reward: 80, cost: 20, color: "#ef4444", boss: true, lives: 5 },
  dread: { name: "Dreadnought", hp: 720, speed: 28, armor: 6, reward: 90, cost: 20, color: "#2563eb", boat: true, boss: true, lives: 5 },
};

export const stat = (type, lvl) => {
  const t = TOWERS[type];
  const k = 1 + 0.55 * lvl;
  return { ...t, dmg: t.dmg * k, range: t.range * (1 + 0.1 * lvl), rate: t.rate * (1 + 0.12 * lvl), gold: (t.gold || 0) * k, slow: t.slow ? t.slow - 0.08 * lvl : 0, splash: t.splash ? t.splash + 6 * lvl : 0 };
};
export const upgradeCost = (tower) => Math.round(TOWERS[tower.type].cost * (0.7 + 0.55 * tower.lvl));
export const sellValue = (tower) => Math.round(tower.spent * 0.7);

const centre = (c, r) => [(c + 0.5) * CELL, (r + 0.5) * CELL];

export function makeMap(i) {
  const rng = new Rng(9000 + i * 37);
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(LAND));
  const low = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const side = rng.chance(0.5) ? 0 : COLS - 1;
  const keep = rng.int(3, 5);
  for (let r = 0; r < ROWS; r++) grid[r][side] = SEA;
  for (let c = 0; c < COLS; c++) grid[ROWS - 1][c] = SEA;
  const inner = () => rng.int(side === 0 ? 2 : 1, side === 0 ? COLS - 2 : COLS - 3);
  const way = [];
  let c = inner();
  way.push([c, -1]);
  for (const r of [3, 6, 9]) {
    let nc = inner();
    while (Math.abs(nc - c) < 2) nc = inner();
    way.push([c, r], [nc, r]);
    c = nc;
  }
  way.push([c, 11], [keep, 11], [keep, 12]);
  for (let w = 1; w < way.length; w++) {
    let [x, y] = way[w - 1];
    const [tx, ty] = way[w];
    const dip = rng.chance(0.35);
    while (x !== tx || y !== ty) {
      if (y >= 0) { grid[y][x] = ROAD; if (dip) low[y][x] = true; }
      x += Math.sign(tx - x);
      y += Math.sign(ty - y);
    }
  }
  grid[ROWS - 1][keep] = ROAD;
  for (let r = 0; r < ROWS - 1; r++) {
    for (let cc = 0; cc < COLS; cc++) {
      if (grid[r][cc] !== LAND) continue;
      const near = Math.abs(cc - side);
      const roll = rng.next();
      if (near === 1 ? roll < 0.75 : near === 2 ? roll < 0.3 : roll < 0.08) grid[r][cc] = SHORE;
      else if (roll > 0.94) grid[r][cc] = ROCK;
    }
  }
  const road = way.map(([x, y]) => centre(x, y));
  const end = keep + (side === 0 ? -1 : 1);
  const sea = [centre(side, -1), centre(side, ROWS - 1), centre(end, ROWS - 1)];
  return { grid, low, road, sea, keep, side, period: 26 - Math.min(8, i * 0.3) };
}

function pathLength(pts) {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  return n;
}

function pointAt(pts, d) {
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const seg = dist(ax, ay, bx, by);
    if (d <= seg) return [ax + ((bx - ax) * d) / seg, ay + ((by - ay) * d) / seg];
    d -= seg;
  }
  return pts[pts.length - 1];
}

export const waveCount = (i) => Math.min(12, 5 + Math.floor(i / 3));

/** The list of enemies in wave w of level i. */
export function makeWave(i, w, total = waveCount(i)) {
  const rng = new Rng(i * 1000 + w + 5);
  const budget = Math.floor((6 + w * 2.6) * (1 + i * 0.05));
  const pool = Object.keys(ENEMIES).filter((k) => !ENEMIES[k].boss && (ENEMIES[k].from || 0) <= i);
  const out = [];
  let left = budget;
  while (left > 0) {
    const k = rng.pick(pool);
    if (ENEMIES[k].cost <= left) { out.push(k); left -= ENEMIES[k].cost; }
  }
  if (w === total - 1 && i % 5 === 4) out.push(i % 10 === 4 ? "warlord" : "dread");
  return out;
}

export class Battle {
  constructor(index, { endless = false } = {}) {
    this.index = index;
    this.endless = endless;
    this.map = makeMap(index);
    this.lenRoad = pathLength(this.map.road);
    this.lenSea = pathLength(this.map.sea);
    this.total = endless ? Infinity : waveCount(index);
    this.t = 0;
    this.gold = 170 + Math.min(180, index * 12);
    this.startLives = this.lives = 20;
    this.towers = [];
    this.enemies = [];
    this.queue = [];
    this.wave = 0;
    this.countdown = 22;
    this.shots = [];
    this.events = [];
    this.flooded = false;
    this.tide = 0;
    this.state = "playing";
    this.nextId = 1;
    this.spawnT = 0;
    this.kills = 0;
  }
  cell(c, r) { return r >= 0 && r < ROWS && c >= 0 && c < COLS ? this.map.grid[r][c] : ROCK; }
  towerAt(c, r) { return this.towers.find((t) => t.c === c && t.r === r); }
  canPlace(type, c, r) {
    const g = this.cell(c, r);
    if (this.towerAt(c, r) || (g !== LAND && g !== SHORE)) return false;
    if (TOWERS[type].shoreOnly && g !== SHORE) return false;
    return this.gold >= TOWERS[type].cost;
  }
  place(type, c, r) {
    if (!this.canPlace(type, c, r)) return null;
    const cost = TOWERS[type].cost;
    this.gold -= cost;
    const [x, y] = centre(c, r);
    const t = { type, c, r, x, y, lvl: 0, cool: 0, spent: cost, id: this.nextId++, shore: this.cell(c, r) === SHORE, flash: 0 };
    this.towers.push(t);
    return t;
  }
  upgrade(t) {
    const cost = upgradeCost(t);
    if (t.lvl >= MAX_LEVEL || this.gold < cost) return false;
    this.gold -= cost;
    t.spent += cost;
    t.lvl++;
    return true;
  }
  sell(t) {
    this.gold += sellValue(t);
    this.towers = this.towers.filter((x) => x !== t);
  }
  /** Gold for sending the next wave before the countdown ends. */
  earlyBonus() { return Math.floor(this.countdown / 2); }
  canSend() { return this.state === "playing" && this.wave < this.total; }
  sendWave(early = true) {
    if (!this.canSend()) return;
    if (early) this.gold += this.earlyBonus();
    this.queue.push(...makeWave(this.index + (this.endless ? Math.floor(this.wave / 3) : 0), this.endless ? this.wave % 12 : this.wave, this.endless ? 12 : this.total));
    this.wave++;
    this.countdown = 24;
    this.events.push({ kind: "wave" });
  }
  spawn(kind) {
    const e = ENEMIES[kind];
    const hpScale = 1 + this.index * 0.085 + this.wave * 0.03;
    const [x, y] = (e.boat ? this.map.sea : this.map.road)[0];
    this.enemies.push({ kind, hp: e.hp * hpScale, max: e.hp * hpScale, d: 0, x, y, slow: 0, slowT: 0, id: this.nextId++, boat: !!e.boat, healT: 1, beached: false });
  }
  isShown(e) {
    if (!ENEMIES[e.kind].mist) return true;
    return this.towers.some((t) => (t.type === "light" && dist(t.x, t.y, e.x, e.y) <= stat("light", t.lvl).range) || dist(t.x, t.y, e.x, e.y) < 46);
  }
  moveEnemy(e, dt) {
    const data = ENEMIES[e.kind];
    let speed = data.speed;
    if (e.slowT > 0) { speed *= e.slow; e.slowT -= dt; }
    if (e.boat) {
      e.beached = !this.flooded;
      if (e.beached) speed *= 0.12;
    } else if (!data.amphibious && this.flooded) {
      const c = clamp(Math.floor(e.x / CELL), 0, COLS - 1), r = clamp(Math.floor(e.y / CELL), 0, ROWS - 1);
      if (this.map.low[r][c]) speed *= 0.5;
    }
    e.d += speed * dt;
    const pts = e.boat ? this.map.sea : this.map.road;
    [e.x, e.y] = pointAt(pts, e.d);
    if (e.d >= (e.boat ? this.lenSea : this.lenRoad)) {
      this.lives -= data.lives || 1;
      e.done = true;
      this.events.push({ kind: "leak", x: e.x, y: e.y });
    }
    if (data.heals) {
      e.healT -= dt;
      if (e.healT <= 0) {
        e.healT = 1.4;
        for (const o of this.enemies) if (o !== e && dist(o.x, o.y, e.x, e.y) < 60) o.hp = Math.min(o.max, o.hp + data.heals * (1 + this.index * 0.08));
      }
    }
  }
  damage(e, amount, tower) {
    const data = ENEMIES[e.kind];
    let hit = amount;
    if (data.boat && tower.boat) hit *= tower.boat;
    if (e.beached) hit *= 1.5;
    hit = Math.max(1, hit - (data.armor || 0));
    e.hp -= hit;
    if (e.hp <= 0 && !e.done) {
      e.done = true;
      this.kills++;
      const reward = Math.round(data.reward * (1 + this.index * 0.05));
      this.gold += reward;
      this.events.push({ kind: "kill", x: e.x, y: e.y, reward, boss: !!data.boss, color: data.color });
    }
  }
  fire(t, dt) {
    const s = stat(t.type, t.lvl);
    t.flash = Math.max(0, t.flash - dt);
    if (t.type === "mill" || t.type === "light") return;
    t.disabled = t.shore && this.flooded;
    if (t.disabled) return;
    let rate = s.rate;
    if (this.towers.some((o) => o.type === "light" && Math.abs(o.c - t.c) <= 1 && Math.abs(o.r - t.r) <= 1)) rate *= 1.3;
    t.cool -= dt;
    if (t.cool > 0) return;
    let best = null;
    for (const e of this.enemies) {
      if (e.done || !this.isShown(e) || dist(t.x, t.y, e.x, e.y) > s.range) continue;
      const lead = e.d / (e.boat ? this.lenSea : this.lenRoad);
      if (!best || lead > best.lead) best = { e, lead };
    }
    if (!best) return;
    t.cool = 1 / rate;
    t.flash = 0.1;
    const e = best.e;
    t.angle = Math.atan2(e.y - t.y, e.x - t.x);
    this.shots.push({ x1: t.x, y1: t.y, x2: e.x, y2: e.y, t: 0.12, color: s.color, wide: t.type === "cannon" });
    this.events.push({ kind: "shot", type: t.type });
    if (s.splash) {
      for (const o of this.enemies) if (!o.done && dist(o.x, o.y, e.x, e.y) <= s.splash) this.damage(o, s.dmg, s);
    } else this.damage(e, s.dmg, s);
    if (s.slow) { e.slow = s.slow; e.slowT = 1.5; }
  }
  step(dt) {
    if (this.state !== "playing") return;
    this.t += dt;
    this.tide = Math.sin((this.t / this.map.period) * Math.PI * 2);
    const was = this.flooded;
    this.flooded = this.tide > 0.2;
    if (this.flooded && !was) {
      this.events.push({ kind: "tide" });
      for (const t of this.towers) {
        if (t.type === "mill") { const g = Math.round(stat("mill", t.lvl).gold); this.gold += g; this.events.push({ kind: "gold", x: t.x, y: t.y, amount: g }); }
      }
    }
    if (this.canSend()) {
      this.countdown -= dt;
      if (this.countdown <= 0 && !this.queue.length) this.sendWave(false);
    }
    this.spawnT -= dt;
    if (this.queue.length && this.spawnT <= 0) {
      this.spawn(this.queue.shift());
      this.spawnT = 0.85;
    }
    for (const e of this.enemies) this.moveEnemy(e, dt);
    for (const t of this.towers) this.fire(t, dt);
    this.enemies = this.enemies.filter((e) => !e.done);
    this.shots = this.shots.filter((s) => (s.t -= dt) > 0);
    if (this.lives <= 0) { this.lives = 0; this.state = "lost"; } else if (this.wave >= this.total && !this.queue.length && !this.enemies.length) this.state = "won";
  }
  stars() {
    if (this.state !== "won") return 0;
    const f = this.lives / this.startLives;
    return f >= 0.9 ? 3 : f >= 0.5 ? 2 : 1;
  }
}

/** Cells for a tower, the ones that see the most road first. */
export function goodCells(b, type) {
  const range = stat(type, 0).range;
  const out = [];
  const samples = [];
  for (let d = 0; d < b.lenRoad; d += 12) samples.push(pointAt(b.map.road, d));
  for (let d = 0; d < b.lenSea; d += 12) samples.push(pointAt(b.map.sea, d));
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const g = b.cell(c, r);
      if (g !== LAND && !(g === SHORE && TOWERS[type].shoreOnly)) continue;
      const [x, y] = centre(c, r);
      out.push({ c, r, n: samples.filter(([a, e]) => dist(a, e, x, y) <= range).length });
    }
  }
  return out.sort((p, q) => q.n - p.n);
}

/** A plain player used by the tests to show that levels can be won. */
export function botMove(b, unlocked = ORDER) {
  const mix = ["bolt", "cannon", "bolt", "harpoon", "brine", "cannon", "light"].filter((t) => unlocked.includes(t));
  const type = mix[b.towers.length % mix.length];
  if (b.gold >= TOWERS[type].cost) {
    const spot = goodCells(b, type).find((p) => !b.towerAt(p.c, p.r));
    if (spot && b.towers.length < 14) { b.place(type, spot.c, spot.r); return; }
  }
  const up = b.towers.filter((t) => t.lvl < MAX_LEVEL && t.type !== "light").sort((p, q) => p.lvl - q.lvl)[0];
  if (up && b.gold >= upgradeCost(up)) b.upgrade(up);
}

export const unlockedAt = (level) => ORDER.filter((k) => TOWERS[k].unlock <= level);
