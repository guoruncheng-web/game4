#!/usr/bin/env python3
"""Queue all Neon Strike and Fruit Slasher audio/VFX jobs in ComfyUI."""

import json
import sys
import urllib.request
import urllib.parse
from pathlib import Path


BASE_URL = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://127.0.0.1:8188"
MODE = sys.argv[2] if len(sys.argv) > 2 else "all"
SEED_OFFSET = int(sys.argv[3]) if len(sys.argv) > 3 else 0
AUDIO_OUTPUT_ROOT = "game_audio_v2" if MODE == "regenerate" else "game_audio"

AUDIO_NEGATIVE = "music, melody, ambience, speech, voice, background noise, long reverb, repeated sound"
IMAGE_NEGATIVE = (
    "text, letters, numbers, logo, watermark, user interface, border, frame labels, character, person, hands, "
    "weapon, spaceship, aircraft, fruit, background scenery, horizon, camera movement, cropped effect, duplicated "
    "effect, multiple unrelated effects, dirty gray background, compression artifacts, gore"
)

AUDIO_JOBS = [
    ("neon_strike/shoot", "Single short futuristic plasma cannon shot from a compact space fighter, sharp electric crack, punchy transient, tiny metallic tail, dry clean game sound effect", 1),
    ("neon_strike/enemy-hit", "Small enemy drone destruction, compact metallic blast, electric sparks and brief debris, punchy arcade sci-fi game sound effect", 1),
    ("neon_strike/player-hurt", "Space fighter armor impact and electrical system failure, heavy low hit, warning crackle, short dry game sound effect", 1),
    ("neon_strike/shield", "Futuristic energy shield activating around a spacecraft, bright rising shimmer, clean power lock, short game pickup sound effect", 1),
    ("neon_strike/boss-warning", "Deep spacecraft combat warning pulse, ominous synthetic alarm, three heavy beats, no voice, no music", 2),
    ("neon_strike/ui", "Clean futuristic interface confirmation click, bright digital chirp, short polished game UI sound effect", 1),
    ("fruit_slasher/whoosh", "Fast katana blade whoosh through air, sharp swish, very short dry close-up game sound effect", 1),
    ("fruit_slasher/slice", "Katana slicing through a ripe juicy fruit, crisp cut, wet pulp snap and light juice splash, close dry game sound effect", 1),
    ("fruit_slasher/combo", "Bright arcade combo reward, quick ascending three-note sparkle, energetic clean game sound effect, no voice", 1),
    ("fruit_slasher/critical", "Brilliant arcade critical hit reward, sharp impact followed by rising crystalline chime, short game sound effect", 1),
    ("fruit_slasher/miss", "Soft wooden thud and short descending failure tone, restrained arcade miss feedback, no voice", 1),
    ("fruit_slasher/bomb", "Compact black powder bomb explosion, deep impact, debris burst and short ringing tail, dramatic game sound effect", 2),
    ("fruit_slasher/ui", "Clean bamboo wooden menu tap with a tiny bright chime, short polished game UI sound effect", 1),
    ("fruit_slasher/new-best", "Joyful arcade new record fanfare, four fast ascending bell notes and sparkling finish, no voice", 2),
]

NEON_STYLE = (
    "premium realistic science-fiction game VFX, deep-space technology, crisp luminous energy, controlled bloom, "
    "high contrast, clean silhouette, readable at mobile-game size, centered isolated effect on pure black background"
)
FRUIT_STYLE = (
    "polished stylized mobile game VFX, joyful hand-painted 2.5D illustration, bold clean silhouette, saturated "
    "color, moonlit bamboo dojo palette, family-friendly, centered isolated effect on pure black background"
)

IMAGE_JOBS = [
    ("neon_strike/player_plasma_bolt", f"A single narrow cyan plasma bolt flying vertically upward, needle-shaped white core, compact blue halo, two short tapering trails, no muzzle and no impact, {NEON_STYLE}"),
    ("neon_strike/player_laser_impact", f"4x4 sprite sheet, 16 sequential animation frames, cyan plasma impact: white contact flash expands into a sharp electric-blue shock ring and six radial sparks, then disappears, fixed centered position in every cell, {NEON_STYLE}"),
    ("neon_strike/engine_exhaust", f"4x4 sprite sheet, 16 sequential frames, seamless looping twin spacecraft engine exhaust pointing downward, white-hot nozzles, cyan core fading to deep blue, stable anchor, no spacecraft body, {NEON_STYLE}"),
    ("neon_strike/enemy_hit_sparks", f"4x4 sprite sheet, 16 sequential frames, compact orange-red armor hit sparks, sharp warm-white flash, five metallic sparks and two glowing fragments, fast decay, {NEON_STYLE}"),
    ("neon_strike/enemy_explosion", f"4x4 sprite sheet, 16 sequential frames, enemy drone explosion, white-orange ignition core, orange fire petals, red pressure wave, few dark metal fragments, smoke dissolves by final frame, {NEON_STYLE}"),
    ("neon_strike/boss_explosion", f"4x4 sprite sheet, 16 sequential frames, massive carrier destruction VFX, three chained white-hot orange detonations merge into broad shockwave, cyan reactor fragments and sparse armor debris, {NEON_STYLE}"),
    ("neon_strike/shield_loop", f"4x4 sprite sheet, 16 sequential frames, seamless looping spherical energy shield, thin cyan rim, subtle hexagonal field cells, faint transparent center, no solid orb, {NEON_STYLE}"),
    ("neon_strike/shield_impact", f"4x4 sprite sheet, 16 sequential frames, localized impact on cyan spherical shield, white contact point blooms into curved electric arcs and hexagonal ripple, rapidly fades, {NEON_STYLE}"),
    ("neon_strike/boss_arrival", f"4x4 sprite sheet, 16 sequential frames, ominous red-orange hyperspace arrival portal forms from sparks, compresses inward, bursts into radial distortion wave and fades, clear center, {NEON_STYLE}"),
    ("neon_strike/powerup_pickup", f"4x4 sprite sheet, 16 sequential frames, bright green energy pickup burst, white-green star core, two expanding rings, six particles spiral inward and disappear, {NEON_STYLE}"),
    ("fruit_slasher/cyan_slash", f"4x4 sprite sheet, 16 sequential frames, fast diagonal sword slash made only of light, white curved core with cyan glow, elegant tapered crescent breaks into star glints and disappears, no sword, {FRUIT_STYLE}"),
    ("fruit_slasher/juice_splash", f"4x4 sprite sheet, 16 sequential frames, fresh fruit juice splash expands into eight rounded droplets and two curved ribbons, glossy highlights, droplets shrink and disappear, no fruit pieces, {FRUIT_STYLE}"),
    ("fruit_slasher/watermelon_splash", f"4x4 sprite sheet, 16 sequential frames, watermelon-red juice burst with pale rind-green accent ring, rounded droplets fan along diagonal cut, tiny black seed silhouettes, no fruit halves, {FRUIT_STYLE}"),
    ("fruit_slasher/citrus_spray", f"4x4 sprite sheet, 16 sequential frames, bright orange citrus spray, sparkling mist and six round droplets, brief translucent orange radial ring, no slices, {FRUIT_STYLE}"),
    ("fruit_slasher/combo_burst", f"4x4 sprite sheet, 16 sequential frames, celebratory golden combo burst, warm-white flash, gold circular brush ring, eight diamond glints, center clear for score, no text, {FRUIT_STYLE}"),
    ("fruit_slasher/critical_slash", f"4x4 sprite sheet, 16 sequential frames, precision critical-hit VFX, thin warm-white slash crosses compact orange sunburst, perfect golden ring and four star points, no text, {FRUIT_STYLE}"),
    ("fruit_slasher/fuse_sparks", f"4x4 sprite sheet, 16 sequential frames, seamless looping tiny bomb fuse sparks, two to four yellow-orange sparks popping upward, small ember glow, no bomb body, {FRUIT_STYLE}"),
    ("fruit_slasher/bomb_explosion", f"4x4 sprite sheet, 16 sequential frames, family-friendly stylized bomb explosion, warm-white core, bold orange-red ring, eight dark rounded fragments, compact charcoal smoke puffs, {FRUIT_STYLE}"),
    ("fruit_slasher/miss_feedback", f"4x4 sprite sheet, 16 sequential frames, subtle missed-fruit feedback, cool gray-blue circular ripple drops downward and breaks into three fading droplets, no symbol, {FRUIT_STYLE}"),
    ("fruit_slasher/new_record", f"4x4 sprite sheet, 16 sequential frames, elegant new-record celebration, warm gold star glints, red and cream paper confetti, soft lantern-light halo, center clear, no text, {FRUIT_STYLE}"),
]

STATIC_VFX_JOBS = [
    ("neon_strike/laser_impact", f"One single compact cyan plasma impact burst, white-hot center, one thin electric-blue shock ring and six short radial sparks, no grid, no repeated objects, {NEON_STYLE}"),
    ("neon_strike/enemy_explosion", f"One single compact orange-red enemy drone explosion, white-hot core, circular pressure ring, a few sharp metal sparks and minimal smoke, no grid, no repeated objects, {NEON_STYLE}"),
    ("neon_strike/boss_explosion", f"One single large carrier reactor explosion, white-orange core, broad red shockwave, cyan reactor sparks and sparse fragments, no grid, no repeated objects, {NEON_STYLE}"),
    ("neon_strike/shield_impact", f"One single thin cyan spherical shield ring with a bright impact point and curved electric arcs on one side, transparent dark center, no grid, no repeated objects, {NEON_STYLE}"),
    ("neon_strike/boss_portal", f"One single ominous red-orange hyperspace portal ring, dark empty center, rotating energy streaks and a few sparks, no grid, no repeated objects, {NEON_STYLE}"),
    ("fruit_slasher/cyan_slash", f"One single diagonal crescent slash made only of brilliant white light with a cyan outer glow, elegant tapered ends, two tiny star glints, no sword, no grid, no repeated objects, {FRUIT_STYLE}"),
    ("fruit_slasher/juice_splash", f"One single compact red-orange fruit juice splash, eight rounded droplets and two curved liquid ribbons, no fruit, no glass, no grid, no repeated objects, {FRUIT_STYLE}"),
    ("fruit_slasher/bomb_explosion", f"One single family-friendly stylized bomb explosion, warm-white center, bold orange-red shock ring, eight dark rounded fragments and compact charcoal smoke, no grid, no repeated objects, {FRUIT_STYLE}"),
    ("fruit_slasher/combo_burst", f"One single celebratory golden combo burst, warm-white center, thin gold brush ring and eight diamond star glints, empty center for score, no text, no grid, no repeated objects, {FRUIT_STYLE}"),
]


def post_prompt(graph):
    data = json.dumps({"prompt": graph}).encode()
    request = urllib.request.Request(
        f"{BASE_URL}/prompt", data=data, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def delete_pending_game_audio():
    with urllib.request.urlopen(f"{BASE_URL}/queue", timeout=30) as response:
        queue = json.load(response)
    prompt_ids = [
        item[1]
        for item in queue["queue_pending"]
        if any(node["class_type"] == "AudioLDM2Node" for node in item[2].values())
    ]
    if prompt_ids:
        data = json.dumps({"delete": prompt_ids}).encode()
        request = urllib.request.Request(
            f"{BASE_URL}/queue", data=data, headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(request, timeout=30):
            pass
    return len(prompt_ids)


def download_qa_assets():
    root = Path("/tmp/game4-assets-qa")
    downloaded = []
    for game, jobs in (("neon_strike", IMAGE_JOBS[:10]), ("fruit_slasher", IMAGE_JOBS[10:])):
        target_dir = root / "vfx" / game
        target_dir.mkdir(parents=True, exist_ok=True)
        for name, _prompt in jobs:
            short_name = name.split("/", 1)[1]
            query = urllib.parse.urlencode({
                "filename": f"{short_name}_00002_.png",
                "subfolder": f"game_vfx/{game}",
                "type": "output",
            })
            target = target_dir / f"{short_name}.png"
            urllib.request.urlretrieve(f"{BASE_URL}/view?{query}", target)
            downloaded.append(str(target))
    for game, jobs in (("neon_strike", AUDIO_JOBS[:6]), ("fruit_slasher", AUDIO_JOBS[6:])):
        target_dir = root / "audio" / game
        target_dir.mkdir(parents=True, exist_ok=True)
        for name, _prompt, _duration in jobs:
            short_name = name.split("/", 1)[1]
            query = urllib.parse.urlencode({
                "filename": f"{short_name}.wav",
                "subfolder": f"game_audio_v2/{game}",
                "type": "output",
            })
            target = target_dir / f"{short_name}.wav"
            urllib.request.urlretrieve(f"{BASE_URL}/view?{query}", target)
            downloaded.append(str(target))
    print(json.dumps({"downloaded": len(downloaded), "root": str(root)}, indent=2))


def download_static_vfx():
    root = Path("/tmp/game4-static-vfx-qa")
    downloaded = []
    for name, _prompt in STATIC_VFX_JOBS:
        game, short_name = name.split("/", 1)
        target_dir = root / game
        target_dir.mkdir(parents=True, exist_ok=True)
        query = urllib.parse.urlencode({
            "filename": f"{short_name}_00001_.png",
            "subfolder": f"game_vfx_static/{game}",
            "type": "output",
        })
        target = target_dir / f"{short_name}.png"
        urllib.request.urlretrieve(f"{BASE_URL}/view?{query}", target)
        downloaded.append(str(target))
    print(json.dumps({"downloaded": len(downloaded), "root": str(root)}, indent=2))


def audio_graph(name, prompt, duration, seed):
    return {
        "1": {"class_type": "AudioLDM2Node", "inputs": {
            "text": prompt, "negative_prompt": AUDIO_NEGATIVE, "duration": duration,
            "guidance_scale": 4.2, "seed": seed, "n_candidates": 1,
            "sample_rate": 16000, "extension": "wav",
        }},
        "2": {"class_type": "SaveAudioNode", "inputs": {
            "waveforms": ["1", 0], "sample_rate": ["1", 1], "extension": "wav",
            "filename": f"{AUDIO_OUTPUT_ROOT}/{name}",
        }},
    }


def image_graph(name, prompt, seed):
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {
            "ckpt_name": "Juggernaut_X_RunDiffusion.safetensors"
        }},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": IMAGE_NEGATIVE, "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {
            "seed": seed, "steps": 28, "cfg": 6.5, "sampler_name": "dpmpp_2m",
            "scheduler": "karras", "denoise": 1.0, "model": ["1", 0],
            "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0],
        }},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {
            "images": ["6", 0], "filename_prefix": f"game_vfx/{name}"
        }},
    }


def static_vfx_graph(name, prompt, seed):
    graph = image_graph(name, prompt, seed)
    graph["4"]["inputs"]["width"] = 512
    graph["4"]["inputs"]["height"] = 512
    graph["7"]["inputs"]["filename_prefix"] = f"game_vfx_static/{name}"
    return graph


def main():
    if MODE == "download-qa":
        download_qa_assets()
        return
    if MODE == "download-static-vfx":
        download_static_vfx()
        return
    if MODE == "vfx-static":
        queued = []
        for index, (name, prompt) in enumerate(STATIC_VFX_JOBS):
            result = post_prompt(static_vfx_graph(name, prompt, 8190000 + index + SEED_OFFSET))
            queued.append(("vfx-static", name, result["prompt_id"]))
        print(json.dumps({"queued": queued, "count": len(queued)}, ensure_ascii=False, indent=2))
        return
    queued = []
    removed = delete_pending_game_audio() if MODE == "regenerate" else 0
    if MODE in ("all", "audio", "audio-one", "audio-rest", "regenerate"):
        start_index = 1 if MODE == "audio-rest" else 0
        jobs = AUDIO_JOBS[:1] if MODE == "audio-one" else AUDIO_JOBS[start_index:]
        for index, (name, prompt, duration) in enumerate(jobs, start=start_index):
            result = post_prompt(audio_graph(name, prompt, duration, 8142100 + index + SEED_OFFSET))
            queued.append(("audio", name, result["prompt_id"]))
    if MODE in ("all", "vfx", "regenerate"):
        for index, (name, prompt) in enumerate(IMAGE_JOBS):
            result = post_prompt(image_graph(name, prompt, 8143000 + index + SEED_OFFSET))
            queued.append(("vfx", name, result["prompt_id"]))
    print(json.dumps({"removed": removed, "queued": queued, "count": len(queued)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
