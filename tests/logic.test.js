import assert from "node:assert/strict";
import test from "node:test";
import { Battle, CELL, COLS, ENEMIES, LAND, LEVELS, MAX_LEVEL, ROAD, ROWS, SEA, SHORE, TOWERS, botMove, makeMap, makeWave, sellValue, stat, unlockedAt, upgradeCost, waveCount } from "../src/logic.js";

const free = (b, kinds = [LAND]) => {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (kinds.includes(b.cell(c, r)) && !b.towerAt(c, r)) return [c, r];
  throw new Error("no free cell");
};

function play(i, seconds = 900) {
  const b = new Battle(i);
  const open = unlockedAt(i);
  for (let f = 0; f < seconds * 20 && b.state === "playing"; f++) {
    if (f % 10 === 0) botMove(b, open);
    b.step(1 / 20);
  }
  return b;
}

test("maps are the same each time and always connected", () => {
  assert.deepEqual(makeMap(7), makeMap(7));
  assert.notDeepEqual(makeMap(7).grid, makeMap(8).grid);
  for (let i = 0; i < LEVELS; i++) {
    const m = makeMap(i);
    for (let w = 1; w < m.road.length; w++) {
      const [a, b] = m.road[w - 1], [c, d] = m.road[w];
      assert.ok(a === c || b === d, "road segments run along the grid");
      for (let t = 0; t <= 8; t++) {
        const x = a + ((c - a) * t) / 8, y = b + ((d - b) * t) / 8;
        if (y >= 0) assert.equal(m.grid[Math.floor(y / CELL)][Math.floor(x / CELL)], ROAD, `level ${i}`);
      }
    }
    assert.ok(m.sea.every(([x, y]) => y < 0 || m.grid[Math.floor(y / CELL)][Math.floor(x / CELL)] === SEA));
    assert.equal(m.grid[ROWS - 1][m.keep], ROAD);
  }
});

test("every level has room to build, including sand for the mill", () => {
  for (let i = 0; i < LEVELS; i++) {
    const n = (k) => makeMap(i).grid.flat().filter((x) => x === k).length;
    assert.ok(n(LAND) >= 15, `level ${i} land`);
    assert.ok(n(SHORE) >= 3, `level ${i} shore`);
  }
});

test("waves grow, and bosses arrive every fifth level", () => {
  assert.ok(makeWave(10, 8).length > makeWave(0, 0).length);
  assert.ok(makeWave(4, waveCount(4) - 1).includes("warlord"));
  assert.ok(makeWave(9, waveCount(9) - 1).includes("dread"));
  assert.ok(!makeWave(0, 4).includes("warlord"));
  assert.ok(makeWave(0, 3).every((k) => (ENEMIES[k].from || 0) === 0));
});

test("placing needs gold and a legal tile", () => {
  const b = new Battle(0);
  const [c, r] = free(b);
  assert.ok(b.place("bolt", c, r));
  assert.equal(b.place("bolt", c, r), null);
  assert.equal(b.gold, 170 - TOWERS.bolt.cost);
  b.gold = 1000;
  assert.equal(b.place("bolt", ...free(b, [SEA, ROAD].flatMap((x) => x)).slice(0, 2)) ?? null, null);
  b.gold = 0;
  assert.equal(b.canPlace("bolt", ...free(b)), false);
});

test("a mill can only stand on sand", () => {
  const b = new Battle(3);
  b.gold = 1000;
  assert.equal(b.place("mill", ...free(b, [LAND])), null);
  assert.ok(b.place("mill", ...free(b, [SHORE])));
});

test("upgrades cost more, stop at the limit, and selling refunds 70%", () => {
  const b = new Battle(0);
  b.gold = 5000;
  const t = b.place("bolt", ...free(b));
  const costs = [];
  while (t.lvl < MAX_LEVEL) { costs.push(upgradeCost(t)); assert.ok(b.upgrade(t)); }
  assert.ok(costs[0] < costs[1] && costs[1] < costs[2]);
  assert.equal(b.upgrade(t), false);
  assert.ok(stat("bolt", 3).dmg > stat("bolt", 0).dmg);
  const v = sellValue(t), g = b.gold;
  assert.equal(v, Math.round(t.spent * 0.7));
  b.sell(t);
  assert.equal(b.gold, g + v);
  assert.equal(b.towers.length, 0);
});

test("the tide floods sand towers and stops them firing", () => {
  const b = new Battle(0);
  const t = b.place("bolt", ...free(b, [SHORE]));
  b.spawn("raider");
  b.enemies[0].x = t.x; b.enemies[0].y = t.y;
  b.flooded = true;
  b.t = b.map.period / 4 - 0.01;
  const before = b.enemies[0].hp;
  b.fire(t, 1);
  assert.equal(t.disabled, true);
  assert.equal(b.enemies[0].hp, before);
});

test("boats stall at low tide and take more damage there", () => {
  const b = new Battle(5);
  b.spawn("boat");
  const e = b.enemies[0];
  b.flooded = false;
  b.moveEnemy(e, 1);
  const slow = e.d;
  assert.ok(e.beached);
  b.flooded = true;
  b.moveEnemy(e, 1);
  assert.ok(e.d - slow > slow * 4);
  const hp = e.hp;
  b.damage(e, 10, {});
  const afloat = hp - e.hp;
  b.flooded = false;
  b.moveEnemy(e, 0);
  const hp2 = e.hp;
  b.damage(e, 10, {});
  assert.ok(hp2 - e.hp > afloat);
});

test("harpoons do more to boats, armour reduces hits", () => {
  const b = new Battle(5);
  b.spawn("boat");
  b.spawn("brute");
  const [boat, brute] = b.enemies;
  b.flooded = true;
  b.moveEnemy(boat, 0);
  const hp = boat.hp;
  b.damage(boat, 10, { boat: 2 });
  assert.equal(hp - boat.hp, 20);
  const h = brute.hp;
  b.damage(brute, 10, {});
  assert.equal(h - brute.hp, 10 - ENEMIES.brute.armor);
});

test("mistwalkers can only be hit when revealed", () => {
  const b = new Battle(9);
  b.gold = 1000;
  b.spawn("mist");
  const e = b.enemies[0];
  assert.equal(b.isShown(e), false);
  const [c, r] = free(b);
  const t = b.place("light", c, r);
  e.x = t.x + 10; e.y = t.y;
  assert.equal(b.isShown(e), true);
});

test("mills pay when the tide comes in", () => {
  const b = new Battle(6);
  b.gold = 500;
  b.place("mill", ...free(b, [SHORE]));
  const g = b.gold;
  b.t = 0; b.flooded = false;
  for (let i = 0; i < 200; i++) b.step(0.05);
  assert.ok(b.flooded);
  assert.ok(b.gold >= g + TOWERS.mill.gold);
});

test("a leak costs lives and losing them all ends the battle", () => {
  const b = new Battle(0);
  b.lives = 1;
  b.spawn("raider");
  b.enemies[0].d = b.lenRoad + 1;
  b.step(0.01);
  assert.equal(b.state, "lost");
  assert.equal(b.stars(), 0);
});

test("sending early pays a bonus and the last wave ends the sending", () => {
  const b = new Battle(0);
  b.countdown = 20;
  const g = b.gold;
  b.sendWave(true);
  assert.equal(b.gold, g + 10);
  b.wave = b.total;
  assert.equal(b.canSend(), false);
});

test("star ratings follow lives kept", () => {
  const b = new Battle(0);
  b.state = "won";
  b.lives = 20; assert.equal(b.stars(), 3);
  b.lives = 12; assert.equal(b.stars(), 2);
  b.lives = 3; assert.equal(b.stars(), 1);
});

test("a plain bot wins at least 28 of the 30 levels", () => {
  const lost = [];
  for (let i = 0; i < LEVELS; i++) if (play(i).state !== "won") lost.push(i + 1);
  assert.ok(lost.length <= 2, `lost levels ${lost}`);
});

test("endless mode keeps going until the shore falls", () => {
  const b = new Battle(12, { endless: true });
  for (let f = 0; f < 40000 && b.state === "playing"; f++) b.step(0.1);
  assert.equal(b.state, "lost");
  assert.ok(b.wave > 3);
});
