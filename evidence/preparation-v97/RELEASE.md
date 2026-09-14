# Preparation layout + startup textures / v97 candidate

Source: b96c33c4d5eeccafae1714474c924fb81bab4878 (layout runtime 1d4a4fa3eec9b9db0004f3b927f314e88367d105 plus reproducible release optimizer).
Backend unchanged: 0773aee8070261b1bdf89ff3a6c9ab6710ab41f4.
Previous live frontend remains v95 / 95ab10b0027a332593507346ae575a5da01e2335 after v96 Actions 34823925212 failed WAIT_Preparation and rolled back successfully.

WebP variants reduce 216 textures from 27,950,937 to 9,792,864 bytes. Original PNG fallback, dimensions, UUIDs and alpha retained. Engine 3.8.8 image format 4_0 selects WebP where supported. Visual screenshots checked; four viewport and exchange/seating/bot checks pass. Full local production PWA: cold4914/cached2475/offline2380ms; 47 WebP requests on first scene; gameplay/audio/cache/offline pass, no runtime/resource errors. Frontend lint/build and 22 version/deploy tests pass. Existing Next middleware deprecation remains a warning.

Public acceptance pending; the 30-second startup gate is unchanged. Failure evidence now includes current document, iframe, scene and resource timings. The build tree manifest accompanies this record. Rollback remains the workflow's prior-production restore, retaining state and backend configuration.
