// Tidewarden screens: menus, the battle view and touch controls.
import { Game, LevelSelect, Result, Scene, Title, backdrop, bar, compose, dot, panel, text, TAU } from "./gamekit.js";
import { Battle, CELL, COLS, ENEMIES, LAND, LEVELS, MAX_LEVEL, ORDER, ROAD, ROCK, ROWS, SEA, SHORE, TOWERS, sellValue, stat, unlockedAt, upgradeCost } from "./logic.js";

export const game = new Game({ id: "tidewarden", title: "Tidewarden", theme: { accent: "#22d3ee", bg: "#071521", bg2: "#0f2a3d", panel: "#14324a" }, defaults: { stars: [], endless: 0 } });
const data = game.store.data;
const X0 = 15, Y0 = 52;

const HELP = [
  ["Hold the shore", "Raiders march down the road and longboats sail the channel. Each one that reaches your keep costs lives. Lose all 20 and the level is over."],
  ["The tide", "Watch the gauge at the top. At high tide, sand floods: towers on it stop firing, and raiders on low road wade at half speed.\n\nBoats only sail at high tide. At low tide they sit beached and take extra damage."],
  ["Building", "Tap an empty land or sand tile, then pick a tower. Tap a tower to upgrade or sell it.\n\nSending a wave early earns bonus gold."],
  ["Towers", "Bolt: fast shots.\nCannon: splash.\nBrine: slows.\nHarpoon: long range, tears boats.\nTide Mill: sand only, pays at each high tide.\nLighthouse: reveals mistwalkers and speeds neighbours."],
];

function art(c, g, t) {
  backdrop(c, g, t);
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.moveTo(0, g.H);
    for (let x = 0; x <= g.W; x += 10) c.lineTo(x, 300 + i * 34 + Math.sin(x / 40 + t * (0.8 + i * 0.2) + i) * 12);
    c.lineTo(g.W, g.H);
    c.closePath();
    c.fillStyle = `rgba(34,211,238,${0.1 + i * 0.05})`;
    c.fill();
  }
}

const title = () => new Title(game, {
  tag: "Hold the shore against the tide",
  art,
  help: HELP,
  play: () => game.go(levels()),
  buttons: [["Spring Tide (endless)", () => game.go(new BattleScene(game, 12, true))]],
});

const levels = () => new LevelSelect(game, {
  title: "Shoreline",
  count: LEVELS,
  unlocked: (i) => i === 0 || (data.stars[i - 1] || 0) > 0,
  stars: (i) => data.stars[i] || 0,
  pick: (i) => game.go(new BattleScene(game, i)),
  back: () => game.go(title()),
});

class BattleScene extends Scene {
  constructor(g, index, endless = false) {
    super(g);
    this.index = index;
    this.endless = endless;
  }
  enter() {
    this.b = new Battle(this.index, { endless: this.endless });
    this.speed = 1;
    this.paused = false;
    this.sel = null;
    this.g.sound.music(compose(this.index + 3, 84));
    this.buildBar();
  }
  hidden() { this.paused = true; this.buildBar(); }
  barY() { return Y0 + ROWS * CELL + 6; }
  buildBar() {
    const g = this.g, y = this.barY(), h = Math.max(56, g.H - y - 8), ui = this.ui;
    ui.clear();
    const s = this.sel;
    if (s && s.tower) {
      const t = s.tower;
      this.upBtn = ui.button(X0, y, 170, h, "Upgrade", () => { if (this.b.upgrade(t)) { g.sound.play("power"); this.buildBar(); } }, { style: "primary", size: 15 });
      ui.button(X0 + 178, y, 100, h, "Sell", () => { this.b.sell(t); g.sound.play("coin"); this.sel = null; this.buildBar(); }, { sub: "+" + sellValue(t) });
      ui.button(X0 + 286, y, 74, h, "Close", () => { this.sel = null; this.buildBar(); });
    } else if (s) {
      const types = unlockedAt(this.endless ? 99 : this.index);
      const w = (360 - (types.length - 1) * 4) / types.length;
      types.forEach((k, i) => {
        ui.button(X0 + i * (w + 4), y, w, h, TOWERS[k].name.split(" ").pop(), () => {
          if (this.b.place(k, s.c, s.r)) { g.sound.play("ok"); g.buzz(12); this.sel = null; this.buildBar(); } else g.sound.play("bad");
        }, { sub: String(TOWERS[k].cost), size: 11, kind: k });
      });
    } else {
      this.send = ui.button(X0, y, 190, h, "Send wave", () => this.b.sendWave(true), { style: "primary", size: 15 });
      ui.button(X0 + 198, y, 80, h, "Speed", (b) => { this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1; b.sub = "x" + this.speed; }, { sub: "x" + this.speed, size: 12 });
      ui.button(X0 + 286, y, 74, h, this.paused ? "Resume" : "Pause", () => { this.paused = !this.paused; this.buildBar(); }, { size: 12 });
    }
  }
  down(p) {
    if (p.y < Y0 || p.y >= Y0 + ROWS * CELL) return;
    const c = Math.floor((p.x - X0) / CELL), r = Math.floor((p.y - Y0) / CELL);
    const tower = this.b.towerAt(c, r);
    const g = this.b.cell(c, r);
    if (tower) this.sel = { c, r, tower };
    else if (g === LAND || g === SHORE) this.sel = { c, r };
    else this.sel = null;
    this.buildBar();
  }
  update(dt) {
    const b = this.b, g = this.g;
    if (!this.paused) for (let i = 0; i < this.speed; i++) b.step(dt);
    for (const e of b.events) {
      if (e.kind === "kill") { g.fx.burst(X0 + e.x, Y0 + e.y, e.color, e.boss ? 40 : 10, 100); g.fx.float(X0 + e.x, Y0 + e.y - 8, "+" + e.reward, g.theme.gold, 12); g.sound.play(e.boss ? "boom" : "hit"); if (e.boss) g.shake(0.4); }
      if (e.kind === "leak") { g.sound.play("bad"); g.buzz(40); g.shake(0.15); }
      if (e.kind === "gold") { g.fx.float(X0 + e.x, Y0 + e.y, "+" + e.amount, g.theme.gold, 14); g.sound.play("coin"); }
      if (e.kind === "tide") g.sound.tone(180, 0.6, { type: "sine", vol: 0.14, slide: 120 });
      if (e.kind === "wave") g.sound.play("power");
    }
    b.events.length = 0;
    if (this.send) {
      const on = b.canSend();
      this.send.disabled = !on;
      this.send.label = !on ? "Last wave" : "Send wave";
      this.send.sub = on ? `in ${Math.ceil(b.countdown)}s, +${b.earlyBonus()} gold` : "";
    }
    if (this.upBtn && this.sel?.tower) {
      const t = this.sel.tower;
      const max = t.lvl >= MAX_LEVEL;
      this.upBtn.label = max ? "Fully upgraded" : "Upgrade";
      this.upBtn.sub = max ? "" : upgradeCost(t) + " gold";
      this.upBtn.disabled = max || b.gold < upgradeCost(t);
    }
    if (b.state !== "playing") this.finish();
  }
  finish() {
    const b = this.b, g = this.g;
    g.sound.stopMusic();
    const again = () => g.go(new BattleScene(g, this.index, this.endless));
    if (this.endless) {
      data.endless = Math.max(data.endless, b.wave);
      g.store.save();
      g.go(new Result(g, { title: "The tide wins", good: false, lines: [`You held for ${b.wave} waves`, `Best: ${data.endless}`, `${b.kills} raiders defeated`], buttons: [["Try again", again, "primary"], ["Menu", () => g.go(title())]] }));
      return;
    }
    const stars = b.stars();
    if (stars > (data.stars[this.index] || 0)) { data.stars[this.index] = stars; g.store.save(); }
    const buttons = [];
    if (stars && this.index + 1 < LEVELS) buttons.push(["Next level", () => g.go(new BattleScene(g, this.index + 1)), "primary"]);
    buttons.push(["Play again", again, stars ? "ghost" : "primary"], ["Levels", () => g.go(levels())]);
    const fresh = ORDER.filter((k) => TOWERS[k].unlock === this.index + 1);
    g.go(new Result(g, { title: stars ? "Shore held" : "Keep overrun", good: !!stars, stars, lines: [`Level ${this.index + 1}`, `${b.lives} of ${b.startLives} lives left`, stars && fresh.length ? `New tower: ${TOWERS[fresh[0]].name}` : ""], buttons }));
  }
  draw(c) {
    const g = this.g, b = this.b, t = this.t;
    c.fillStyle = g.theme.bg;
    c.fillRect(0, 0, g.W, g.H);
    text(c, `${b.lives}`, 30, 24, { size: 19, weight: 800, color: "#fda4af" });
    text(c, "lives", 30, 41, { size: 10, color: g.theme.muted });
    text(c, `${Math.floor(b.gold)}`, 84, 24, { size: 19, weight: 800, color: g.theme.gold });
    text(c, "gold", 84, 41, { size: 10, color: g.theme.muted });
    text(c, this.endless ? `${b.wave}` : `${b.wave}/${b.total}`, 146, 24, { size: 19, weight: 800 });
    text(c, "wave", 146, 41, { size: 10, color: g.theme.muted });
    text(c, b.flooded ? "HIGH TIDE" : "LOW TIDE", 288, 16, { size: 11, weight: 800, color: b.flooded ? g.theme.accent : "#fcd34d" });
    bar(c, 196, 28, 184, 10, (b.tide + 1) / 2, b.flooded ? g.theme.accent : "#fcd34d");
    c.fillStyle = "rgba(255,255,255,.6)";
    c.fillRect(196 + 184 * 0.6, 24, 2, 18);
    c.save();
    c.translate(X0, Y0);
    const wet = `rgb(${20},${100 + Math.sin(t * 2) * 8},${150})`;
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        const k = b.map.grid[r][col], x = col * CELL, y = r * CELL;
        let fill = "#2c5e3f";
        if (k === SHORE) fill = b.flooded ? wet : "#c9b37a";
        if (k === ROAD) fill = b.map.low[r][col] && b.flooded ? "#3d6f8d" : "#7a5c3e";
        if (k === SEA) fill = b.flooded ? "#155f8c" : "#46624f";
        if (k === ROCK) fill = "#4b5563";
        c.fillStyle = fill;
        c.fillRect(x, y, CELL + 0.5, CELL + 0.5);
        if (k === ROCK) dot(c, x + 20, y + 21, 12, "#6b7280");
        if (k === SEA && b.flooded) { c.fillStyle = "rgba(255,255,255,.1)"; c.fillRect(x + 6, y + 14 + Math.sin(t * 2 + col + r) * 5, 26, 2); }
        if (k === ROAD && b.map.low[r][col] && !b.flooded) { c.fillStyle = "rgba(14,116,144,.3)"; c.fillRect(x, y, CELL, CELL); }
      }
    }
    panel(c, b.map.keep * CELL + 4, (ROWS - 1) * CELL + 2, CELL - 8, CELL - 4, "#e2e8f0", 6);
    text(c, "K", (b.map.keep + 0.5) * CELL, (ROWS - 0.5) * CELL, { size: 18, color: "#334155", weight: 900 });
    if (this.sel) {
      c.strokeStyle = "#fff";
      c.lineWidth = 2;
      c.strokeRect(this.sel.c * CELL + 1, this.sel.r * CELL + 1, CELL - 2, CELL - 2);
      if (this.sel.tower && stat(this.sel.tower.type, this.sel.tower.lvl).range) {
        const tw = this.sel.tower;
        c.beginPath();
        c.arc(tw.x, tw.y, stat(tw.type, tw.lvl).range, 0, TAU);
        c.fillStyle = "rgba(255,255,255,.08)";
        c.fill();
        c.stroke();
      }
    }
    for (const tw of b.towers) this.drawTower(c, tw);
    for (const e of b.enemies) this.drawEnemy(c, e);
    for (const s of b.shots) {
      c.strokeStyle = s.color;
      c.lineWidth = s.wide ? 4 : 2;
      c.beginPath();
      c.moveTo(s.x1, s.y1);
      c.lineTo(s.x2, s.y2);
      c.stroke();
    }
    c.restore();
    if (this.sel?.tower) {
      const tw = this.sel.tower;
      text(c, `${TOWERS[tw.type].name}, level ${tw.lvl + 1}`, g.W / 2, Y0 - 6, { size: 11, color: g.theme.ink });
    } else if (this.sel) {
      text(c, b.cell(this.sel.c, this.sel.r) === SHORE ? "Sand: floods at high tide" : "Dry land: always fires", g.W / 2, Y0 - 6, { size: 11, color: g.theme.ink });
    }
    if (this.paused) {
      c.fillStyle = "rgba(0,0,0,.55)";
      c.fillRect(0, 0, g.W, Y0 + ROWS * CELL);
      text(c, "Paused", g.W / 2, 280, { size: 32, weight: 800 });
      text(c, "Tap Resume to carry on", g.W / 2, 318, { size: 14, color: g.theme.muted });
    }
  }
  drawTower(c, tw) {
    const d = TOWERS[tw.type];
    panel(c, tw.c * CELL + 4, tw.r * CELL + 4, CELL - 8, CELL - 8, tw.disabled ? "#475569" : "#1e293b", 8, d.color);
    dot(c, tw.x, tw.y, 9 + tw.lvl, tw.disabled ? "#64748b" : d.color);
    if (tw.type === "bolt" || tw.type === "cannon" || tw.type === "harpoon") {
      const a = tw.angle ?? -Math.PI / 2;
      c.strokeStyle = "#0f172a";
      c.lineWidth = tw.type === "cannon" ? 6 : 3;
      c.beginPath();
      c.moveTo(tw.x, tw.y);
      c.lineTo(tw.x + Math.cos(a) * 14, tw.y + Math.sin(a) * 14);
      c.stroke();
    }
    for (let i = 0; i < tw.lvl; i++) dot(c, tw.c * CELL + 10 + i * 7, tw.r * CELL + CELL - 9, 2.2, "#fff");
  }
  drawEnemy(c, e) {
    const d = ENEMIES[e.kind], b = this.b;
    const shown = b.isShown(e);
    const size = d.boss ? 13 : d.boat ? 9 : 7;
    c.globalAlpha = shown ? 1 : 0.3;
    if (d.boat) {
      c.save();
      c.translate(e.x, e.y);
      panel(c, -size, -size * 1.4, size * 2, size * 2.8, e.beached ? "#6b7280" : d.color, 6);
      c.restore();
    } else dot(c, e.x, e.y, size, d.color);
    c.globalAlpha = 1;
    if (e.hp < e.max) bar(c, e.x - 11, e.y - size - 8, 22, 4, e.hp / e.max, "#4ade80", "rgba(0,0,0,.5)");
  }
}

game.start(title());
