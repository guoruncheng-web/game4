# Preparation startup / PWA v99 candidate

Game source: 0c37eeb43b8f093e0cf1f3ca252f6a9f141fdd9d. Backend unchanged: 0773aee8070261b1bdf89ff3a6c9ab6710ab41f4. Previous actual production remains v95 / 95ab10b0027a332593507346ae575a5da01e2335 after failed v98 Actions34827640441 and successful rollback.

Loading immediately navigates to Preparation, discarding its asynchronous audio load on destruction. Skip that unused preload; Preparation/Match keep working audio. Extend the full-record metadata pack with24 AudioClip records:480 records,160918bytes. First-scene JSON requests130→11. WebP alternatives, PNG fallback and compact layout remain.

Fresh Creator3.8.8 source build;767 unaffected build files checked before reusing derived WebP data; exact final tree manifest saved. Local production cold3737/cached2314/offline2286ms; short/full layout, exchange, bots, cards, settlement, audio and offline all pass without errors. Frontend production build and26 deployment/version/launcher checks pass.

Public diagnostic wait is180s so slow startup can still produce complete functional evidence; final accepted still requires cold startup<=30000ms, with automatic rollback on failure. This is not a performance waiver. Public acceptance pending; v98 failed run and interrupted rollback-overlap diagnostic retained under evidence/preparation-v98.
