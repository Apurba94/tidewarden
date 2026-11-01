# Tidewarden

A tower defence for phones where the battlefield moves. The sea rises and falls on a timer: at high tide sand floods and towers built on
it fall silent, raiders wade through low road at half speed, and longboats sail for your keep. At low tide those boats sit beached and
exposed.

**[Play it now](https://apurba94.github.io/tidewarden/)** in your phone's browser, then use "Add to Home Screen" to install it. After the
first visit it works offline.

* 30 generated shoreline levels with three-star ratings, plus an endless Spring Tide mode.
* 6 towers with 4 tiers each, including a mill that earns gold at each high tide and a lighthouse that reveals mistwalkers.
* 9 enemy types, with a Warlord or Dreadnought boss on every fifth level.
* Sound and music are generated in the browser, and progress is saved on your device.

No ads, no accounts, no tracking and no network use after the first load.

## Run from source

```bash
npx serve .
npm test
```

The game is plain JavaScript with no dependencies. Any static file server works. `src/logic.js` holds the rules, and `src/main.js` holds
the screens.

## How it is tested

The tests cover the rules and map generation. A plain bot also plays all 30 levels and has to win at least 28, which checks that the
difficulty curve is beatable, though not that it feels right to a person.

## License

MIT
