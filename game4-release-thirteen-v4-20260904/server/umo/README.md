# UMO authoritative core

This directory vendors the engine-independent UMO rules, room and gateway implementation from the Cocos project. It intentionally lives under `server/` rather than another game's client directory so game modules never import each other.

Source project: `/Users/mac/projects/cocos-game-studio/games/umo/m0-ts/src/`

Source feature commit: `cb571c5`

The transport adapter shares game4's `/ws` listener and is selected by `?game=umo`. UMO remains anonymous at the transport layer; private recovery tokens and per-seat views are issued by the UMO gateway and are never exposed to other seats.

The current vendored authority also includes team pulse/scoring/emotes and authoritative timeout/disconnect automation. When `UMO_STATE_FILE` and `UMO_STATE_KEY` are configured, game4 atomically persists an AES-256-GCM encrypted Gateway snapshot and restores it with the five-second automation grace. The state key is deployment-only and must never enter this repository.
