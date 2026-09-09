# Game Box cartoon UI visual parity

Target viewport: 435 × 904 CSS pixels. Reference images are resized from
870 × 1808 with bicubic sampling. The top 85 pixels of the hub, messages,
and profile comparisons are excluded because avatar, identity, wallet
balance, and sound state are intentionally rendered as live UI.

| Screen | Reference | RGB MAE | P95 channel error | Pixels within 5 |
| --- | --- | ---: | ---: | ---: |
| Home | `game-box-game-native-hub-concept-v3.png` | 1.525 | 6 | 90.56% |
| Messages | `game-box-messages-background-clean-v4.png` | 1.607 | 6 | 90.01% |
| Profile | `game-box-profile-background-clean-v3.png` | 1.402 | 5 | 92.42% |
| Register | `game-box-auth-gate-concept-v1.png` | 1.687 | 7 | 87.96% |
| Login | `game-box-auth-login-concept-v1.png` | 1.589 | 7 | 88.81% |

All five comparisons keep at least 97.63% of pixels within a maximum
10-level RGB channel error. The remaining differences are browser/Pillow
resampling and the intentionally live form controls.

Dynamic-data acceptance:

- Avatar, player name, UID, wallet balance, profile statistics, friend
  names, last messages, unread badges, chat messages, captcha, account,
  and password remain separate DOM/data values.
- Login and registration are independent `/auth` page states rather
  than a modal.
- `validate-game-box-shell.mjs` passed at 435 × 904: all five route
  states rendered without horizontal overflow or runtime exceptions,
  both auth states retained their live inputs, and all three controller
  tabs changed scene successfully.
- The authenticated fixture uses local API interception only and never
  creates or changes production accounts.
- Game routes and embedded game builds are unchanged.

Evidence:

- `visual-parity-comparison.jpg`: reference, runtime, and amplified
  five-times difference rows.
- `rc-*-435x904.png`: final guest and authenticated runtime captures.
