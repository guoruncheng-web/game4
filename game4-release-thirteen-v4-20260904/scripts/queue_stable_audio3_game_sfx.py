#!/usr/bin/env python3
"""Queue and download Stable Audio 3 Small SFX game-audio renders."""

import json
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


BASE_URL = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://127.0.0.1:8188"
MODE = sys.argv[2] if len(sys.argv) > 2 else "samples"

JOBS = [
    ("neon_strike/shoot", "A single compact futuristic plasma cannon pulse, rounded electric snap with a firm low-mid body, soft controlled top end, tiny metallic decay, close and dry, polished mobile game one-shot, no piercing treble, no hiss, no music. Length: 1 second", 1.0),
    ("neon_strike/enemy-hit", "A compact enemy drone destruction one-shot, dense low-mid metallic impact followed by restrained electrical sparks and two tiny debris ticks, close and dry, smooth controlled high frequencies, no harsh crackle, no music. Length: 2 seconds", 2.0),
    ("neon_strike/player-hurt", "A spacecraft armor impact with a heavy rounded low thump and brief muffled electrical system crackle, close cockpit perspective, short dry decay, controlled high frequencies, no piercing alarm, no music. Length: 2 seconds", 2.0),
    ("neon_strike/shield", "A futuristic energy shield activation, soft rising electrical shimmer settling into one warm power-lock pulse, clean and rounded, close and dry, restrained treble, no piercing whistle, no music. Length: 2 seconds", 2.0),
    ("neon_strike/boss-warning", "Three slow heavy spacecraft warning pulses with deep rounded synthetic body and a subdued dark tail, powerful but not loud, no siren, no piercing treble, no voice, no music. Length: 3 seconds", 3.0),
    ("neon_strike/ui", "A single soft futuristic interface confirmation click with a muted digital chirp, rounded transient, very short clean dry decay, no piercing treble, no music. Length: 1 second", 1.0),
    ("fruit_slasher/whoosh", "A single fast katana blade swing through air, smooth broad whoosh with a soft cloth-like body and restrained metallic edge, close and dry, no sharp whistle, no piercing treble, no music. Length: 1 second", 1.0),
    ("fruit_slasher/slice", "A single katana slicing through ripe juicy fruit, crisp but rounded cut followed by a soft wet pulp snap and two small juice droplets, close and dry, no harsh high frequencies, no music. Length: 1 second", 1.0),
    ("fruit_slasher/combo", "A short friendly arcade combo reward with three warm ascending wooden bell tones and a soft sparkle finish, rounded attack, restrained treble, no piercing chime, no voice, no music. Length: 2 seconds", 2.0),
    ("fruit_slasher/critical", "A satisfying critical-hit one-shot, firm rounded impact followed by one warm rising crystalline tone, polished mobile game feedback, controlled high frequencies, no piercing chime, no music. Length: 2 seconds", 2.0),
    ("fruit_slasher/miss", "A soft wooden thud followed by one muted descending failure tone, restrained and friendly arcade feedback, short dry decay, no buzzer, no piercing treble, no voice, no music. Length: 2 seconds", 2.0),
    ("fruit_slasher/bomb", "A compact stylized black-powder bomb explosion, deep rounded impact with a brief soft debris burst and short dark tail, powerful but controlled, no clipping, no ringing ears effect, no harsh treble, no music. Length: 3 seconds", 3.0),
    ("fruit_slasher/ui", "A single soft bamboo menu tap with a tiny warm wooden resonance, clean close dry recording, rounded transient, no bright chime, no piercing treble, no music. Length: 1 second", 1.0),
    ("fruit_slasher/new-best", "A short joyful new-record reward with four warm ascending wooden bell notes and a gentle soft sparkle ending, rounded attacks, restrained treble, no piercing chimes, no voice, no music. Length: 3 seconds", 3.0),
]


def graph(name: str, prompt: str, duration: float, seed: int) -> dict:
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {
            "ckpt_name": "stable_audio_3_small_sfx.safetensors",
        }},
        "2": {"class_type": "CLIPLoader", "inputs": {
            "clip_name": "t5gemma_b_b_ul2.safetensors", "type": "stable_audio", "device": "default",
        }},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": "", "clip": ["2", 0]}},
        "5": {"class_type": "EmptyLatentAudio", "inputs": {"seconds": duration, "batch_size": 1}},
        "6": {"class_type": "KSampler", "inputs": {
            "model": ["1", 0], "seed": seed, "steps": 8, "cfg": 1.0,
            "sampler_name": "lcm", "scheduler": "simple", "positive": ["3", 0],
            "negative": ["4", 0], "latent_image": ["5", 0], "denoise": 1.0,
        }},
        "7": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["6", 0], "vae": ["1", 2]}},
        "8": {"class_type": "SaveAudioAdvanced", "inputs": {
            "audio": ["7", 0], "filename_prefix": f"game_audio_sa3/{name}", "format": "flac",
        }},
    }


def post_prompt(workflow: dict) -> str:
    body = json.dumps({"prompt": workflow, "client_id": "game4_stable_audio3"}).encode()
    request = urllib.request.Request(
        f"{BASE_URL}/prompt", data=body, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)["prompt_id"]


def download_outputs(mastered: bool = False) -> None:
    root = Path("/tmp/game4-stable-audio3")
    output_root = "game_audio_sa3_mastered" if mastered else "game_audio_sa3"
    extension = "wav" if mastered else "flac"
    for name, _prompt, _duration in JOBS:
        game, short_name = name.split("/", 1)
        target_dir = root / game
        target_dir.mkdir(parents=True, exist_ok=True)
        query = urllib.parse.urlencode({
            "filename": f"{short_name}.{extension}" if mastered else f"{short_name}_00001.flac",
            "subfolder": f"{output_root}/{game}",
            "type": "output",
        })
        target = target_dir / f"{short_name}.{extension}"
        if target.exists() and target.stat().st_size > 0:
            continue
        try:
            urllib.request.urlretrieve(
                f"{BASE_URL}/view?{query}", target
            )
        except Exception as error:
            print(f"skip {name}: {error}")
    print(root)


def main() -> None:
    if MODE in ("download", "download-mastered"):
        download_outputs(mastered=MODE == "download-mastered")
        return
    jobs = (JOBS[0], JOBS[7]) if MODE == "samples" else JOBS
    payloads = [
        (name, graph(name, prompt, duration, 8152600 + index))
        for index, (name, prompt, duration) in enumerate(jobs)
    ]
    with ThreadPoolExecutor(max_workers=4) as executor:
        prompt_ids = list(executor.map(lambda item: post_prompt(item[1]), payloads))
    queued = [
        {"name": name, "prompt_id": prompt_id}
        for (name, _workflow), prompt_id in zip(payloads, prompt_ids)
    ]
    print(json.dumps(queued, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
