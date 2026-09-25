# Underkeep

A dark-medieval **dungeon-keeping roguelike** in the spirit of *Dungeon Keeper* (1997), rendered in a clean PlayStation 1 style: low internal resolution with an integer upscale, wobbling vertex snapping, affine texture warp, 15-bit dithered colour, Gouraud lighting and hand-built procedural textures and models.

It uses no image or audio files. Every texture is painted in code, every creature is a small procedural rig, and all sound and music is synthesised with WebAudio.

## Running

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/
npm run build:single   # one self-contained dist/underkeep.html (fonts and code inlined)
```

Handy URL flags for development:

- `?play&seed=123` skips the menus and drops you straight into a realm.

## How to play

You are a Keeper. Each realm is a cheerful little kingdom you must despoil from beneath.

**The Hand of Evil**
- **Left-click and drag on earth** to mark it for digging. Imps dig, haul gold to your Treasury, claim floor tiles and fortify walls.
- **Left-click a minion** to pick it up (up to 8). **Right-click** your own territory to drop it. Drop fighters on top of intruders.
- **Right-click a minion** to slap it. It works faster, but grows resentful.
- **Left-click loose gold** to scoop it into your coffers.

**Building.** Paint rooms onto claimed floor from the **Rooms** tab:
Treasury, Lair, Hatchery, Training Pit, Library, Guard Post, Workshop, Bridge, Prison, Graveyard, Torture Chamber, Temple. Better rooms attract better creatures through the **Portal**.

**Minions** need beds, chickens and wages. Payday comes regularly, and an empty treasury leads to mutiny. Each creature has its own jobs: warlocks research, trolls forge, goblins train.

**Spells** (gold-powered): Create Imp, Sight of Evil, Call to Arms, **Possess**, Speed, Heal, Lightning, Protect, Cave-In, Chicken, Hellfire. The Library researches new rooms and spells.

**Possession** lets you see through a minion's eyes in first person. Use WASD to move, the mouse to look, left-click to attack (or dig, as an imp), and right-click to release.

**Forge.** Trolls in a Workshop make spike, fire, lightning and alarm traps, and wooden and iron doors. Heroes have to bash doors down.

**Captives.** With a Prison built, heroes are knocked out instead of killed. Imps drag them to cells, where they starve and rise as your Skeletons. Drop them into a Torture Chamber with the Hand to break them to your side. Imps also carry corpses to the Graveyard, where they rot into Vampires.

### The run (roguelike layer)

- A branching map of 8 columns leads to **Shiningspire** and the Avatar.
- Node types: **Conquest** (slay the Lord), **Siege** (survive the invasions), **Plunder** (hoard gold), **Elite**, **Dark Shrine** (a free relic, sometimes cursed), **Black Market** (spend souls) and the **Boss**.
- **Omens** reshape each realm: rich veins, twin portals, blood moon, crusades, famine, lava rivers and more.
- **Relics** are permanent boons for the run, and some are accursed bargains.
- After a victory, choose a **retinue** of survivors to follow you. They keep their levels.
- Researched rooms and spells stay known between realms. **If your Dungeon Heart falls, the run is over.**
- The run is saved between realms (localStorage).

### Keys

| Key | Action |
| --- | --- |
| WASD / arrows / screen edge | Pan |
| Q / E, middle-drag | Rotate |
| Mouse wheel, + / - | Zoom |
| Space | Pause |
| 1 / 2 / 3 | Game speed |
| H | Jump to the Dungeon Heart |
| Tab | Cycle panel tabs |
| M | Toggle music |
| Esc | Cancel tool / menu |

## Code tour

```
src/
  main.ts            flow controller: title, run map, realms, rewards
  app.ts             rendering + input + HUD glue for a realm
  possess.ts         first-person possession
  game/              simulation (no rendering)
    game.ts          realm state & fixed-step update
    mapgen.ts        procedural realm generator
    imp.ts           imp job system (dig, haul, claim, fortify, drag captives)
    ai.ts            minion / hero / chicken AI, captive states
    combat.ts        melee, ranged, projectiles
    director.ts      portal attraction, hatchery, hero waves, objectives, crates
    traps.ts         forge items, traps and doors
    spells.ts        keeper spells
    keeper.ts        economy & research
  run/               roguelike layer: run map, relics, omens, demo backdrop
  render/            PS1 pipeline, procedural textures/models, terrain, FX
  ui/                HUD and menu screens
  audio/sfx.ts       procedural WebAudio SFX, ambience and music
```
