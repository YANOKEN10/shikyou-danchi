# Horror gameplay design research — 2026-11-07

Research uses public developer descriptions and official manuals, not a claim of hands-on playtesting of the reference titles.

| Reference | Published design principle | Shikyou Danchi application |
| --- | --- | --- |
| [Amnesia: The Bunker](https://store.steampowered.com/app/1944430/Amnesia_The_Bunker/) | A dynamic threat reacts to movement and sound; tools and light involve survival decisions. | The stalker updates its remembered position only from actual sight or audible footsteps. Walls attenuate hearing. After losing contact it investigates the remembered location and then resumes patrol. |
| [Resident Evil Village official manual](https://game.capcom.com/manual/village/en/ps5/page/13/6) | The map communicates exploration state. | The notebook records visited rooms, current objective and items/notes actually acquired there. “Items found” explicitly does not certify full completion. |
| [The Exit 8](https://store.steampowered.com/app/2653790/The_Exit_8/) | Careful observation of familiar surroundings makes anomalies meaningful. | Preserve existing mirrors and room anomalies; prevent a major random apparition from starting during a chase or recovery window so changes remain legible. |
| [SIGNALIS](https://store.steampowered.com/app/1262350/SIGNALIS/) | Resource management, exploration and puzzles support psychological horror. | Keep the flashlight/battery decisions and existing emergency battery recovery. Put practical stealth guidance and the current objective alongside the exploration journal. |

## Implemented boundaries

- Normal story stalkers use sight/sound memory. The scripted 5F-to-1F escape pursuer retains its separate trail-following logic and escapable speeds.
- Dynamic major scares wait through an 18-second recovery window after a chase; a stress budget also controls readiness. Menu time does not advance these timers.
- The journal is stored inside the existing save flags. Old saves without journal entries still work. Entries reveal only entered rooms and actually acquired items/notes; current-floor accessible room numbers are shown as unvisited.
- Competitive tag keeps its existing rules and does not create story journal entries.
- Existing music assignments and audio volume are unchanged.

## Verification

Browser verification covers visible/occluded targets, quiet versus running footsteps, wall-separated capture, recovery timing, real item acquisition, local save/restore, journal layout and language output. Existing usage-name checks and the whole-building tag regression are required before publication. Production source hashes and browser loading are checked after deployment.
