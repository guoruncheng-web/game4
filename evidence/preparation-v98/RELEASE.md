# Preparation startup / PWA v98 candidate

Source 1e571ce07d8dc31ed2a383692d6322f4216a7844; runtime layout 1d4a4fa3eec9b9db0004f3b927f314e88367d105 with WebP and metadata pack postprocessing. Backend unchanged 0773aee8070261b1bdf89ff3a6c9ab6710ab41f4. Actual previous production remains v95 / 95ab10b0027a332593507346ae575a5da01e2335 after failed v96/v97 attempts and successful automatic rollback.

Retains original PNG fallback and existing UUIDs. Combines 456 serialized metadata records into a 157777-byte pack understood by Creator3.8.8 PackManager.unpackJson. First-page JSON requests decrease130→35, with47WebP downloads. Exact hosted/source tree identity recorded beside this document.

Local production cold4048/cached2355/offline2326ms; real viewport496/780 restoration, exchange/seating, bot match, all card frames, settlement return, audio, cache and offline play pass. Frontend production build and26 deployment/version tests pass. Public30s startup gate unchanged; Chrome preflight occurs before production cutover. v97 failures and their browser/scene diagnostics preserved in evidence/preparation-v97. Public acceptance pending.
