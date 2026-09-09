# Game Box cartoon UI visual parity

Target viewport: 435 × 904 CSS pixels. Reference images are resized from
870 × 1808 with bicubic sampling. The top 85 pixels of the hub, messages,
and profile comparisons are excluded because avatar, identity, wallet
balance, and sound state are intentionally rendered as live UI.

| Screen | Reference | RGB MAE | P95 channel error | Pixels within 5 |
| --- | --- | ---: | ---: | ---: |
| Home | `game-box-game-native-hub-concept-v3.png` | 2.729 | 9 | 70.26% |
| Messages | `game-box-messages-background-clean-v4.png` | 2.708 | 9 | 71.64% |
| Profile | `game-box-profile-background-clean-v3.png` | 2.584 | 8 | 73.11% |
| Register | `game-box-auth-gate-concept-v1.png` | 2.667 | 9 | 72.48% |
| Login | `game-box-auth-login-concept-v1.png` | 2.582 | 9 | 73.91% |

All five comparisons keep at least 91.29% of pixels within a maximum
10-level RGB channel error. The remaining differences are the quality-94
runtime WebP encoding, browser/Pillow resampling, and intentionally live
form controls. Approved PNG sources remain unchanged as the parity masters.

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
- The first v79 public candidate exposed a 20-second cross-region transfer
  for 2.3–2.6 MB PNG page layers and was rolled back after an unrelated
  robot-result test race. The v80 candidate serves 312–493 KB same-size
  WebP layers so a fresh profile does not remain on the sky fallback while
  the visual layer downloads.

Evidence:

- `visual-parity-comparison.jpg`: reference, runtime, and amplified
  five-times difference rows.
- `rc-*-435x904.png`: final guest and authenticated runtime captures.
