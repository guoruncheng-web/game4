#!/usr/bin/env python3
"""叠叠消 rFXGen 音效构建器。

生成 rFXGen 原生预设，调用 Mac 上的 rFXGen 渲染各层，再混合为游戏用 WAV。

用法：
  python3 tools/audio/triple-pile/build_sfx.py --ssh mac@192.168.64.1
  python3 tools/audio/triple-pile/build_sfx.py --rfxgen /path/to/rfxgen
"""

from __future__ import annotations

import argparse
import array
import math
import shutil
import struct
import subprocess
import tempfile
import wave
from dataclasses import dataclass, field
from pathlib import Path


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PRESETS = HERE / "presets"
OUT = ROOT / "public/triple-pile/assets/audio"
MAC_RFXGEN = "$HOME/Applications/rFXGen/rfxgen_v5.0_macos/rfxgen.app/Contents/MacOS/rfxgen"

SQUARE, SAW, SINE, NOISE = range(4)

FIELDS = (
    "randSeed", "waveType", "attackTime", "sustainTime", "sustainPunch", "decayTime",
    "startFrequency", "minFrequency", "slide", "deltaSlide", "vibratoDepth", "vibratoSpeed",
    "changeAmount", "changeSpeed", "squareDuty", "dutySweep", "repeatSpeed",
    "phaserOffset", "phaserSweep", "lpfCutoff", "lpfCutoffSweep", "lpfResonance",
    "hpfCutoff", "hpfCutoffSweep",
)

DEFAULTS = {
    "randSeed": 0x5450, "waveType": SQUARE,
    "attackTime": 0.0, "sustainTime": 0.3, "sustainPunch": 0.0, "decayTime": 0.4,
    "startFrequency": 0.3, "minFrequency": 0.0, "slide": 0.0, "deltaSlide": 0.0,
    "vibratoDepth": 0.0, "vibratoSpeed": 0.0, "changeAmount": 0.0, "changeSpeed": 0.0,
    "squareDuty": 0.0, "dutySweep": 0.0, "repeatSpeed": 0.0,
    "phaserOffset": 0.0, "phaserSweep": 0.0, "lpfCutoff": 1.0, "lpfCutoffSweep": 0.0,
    "lpfResonance": 0.0, "hpfCutoff": 0.0, "hpfCutoffSweep": 0.0,
}


@dataclass(frozen=True)
class Layer:
    params: dict[str, float | int]
    gain: float = 1.0
    at: float = 0.0


@dataclass(frozen=True)
class Sound:
    name: str
    peak: float
    layers: tuple[Layer, ...] = field(default_factory=tuple)


def layer(wave_type: int, gain: float = 1.0, at: float = 0.0, **params: float) -> Layer:
    return Layer({"waveType": wave_type, **params}, gain, at)


SOUNDS = (
    Sound("pick", 0.46, (
        layer(SINE, startFrequency=0.43, slide=-0.12, deltaSlide=-0.12, sustainTime=0.07,
              sustainPunch=0.55, decayTime=0.18, lpfCutoff=0.52),
        layer(NOISE, 0.22, startFrequency=0.18, sustainTime=0.04, decayTime=0.10, lpfCutoff=0.20),
    )),
    Sound("slot", 0.36, (
        layer(SQUARE, startFrequency=0.34, slide=-0.09, deltaSlide=-0.09, sustainTime=0.055,
              sustainPunch=0.48, decayTime=0.14, squareDuty=0.48, lpfCutoff=0.42),
    )),
    Sound("clear", 0.68, tuple(
        layer(SINE, 1.0, at, startFrequency=freq, sustainTime=0.055, sustainPunch=0.28,
              decayTime=0.22, lpfCutoff=0.82)
        for at, freq in ((0.0, 0.45), (0.07, 0.56), (0.14, 0.69))
    ) + (
        layer(NOISE, 0.26, 0.14, startFrequency=0.42, slide=-0.25, deltaSlide=-0.25,
              sustainTime=0.05, decayTime=0.22, lpfCutoff=0.66, hpfCutoff=0.12),
    )),
    Sound("tumble", 0.52, (
        layer(SINE, startFrequency=0.115, slide=-0.16, deltaSlide=-0.16, sustainTime=0.10,
              sustainPunch=0.48, decayTime=0.28, lpfCutoff=0.26),
        layer(NOISE, 0.48, startFrequency=0.22, slide=-0.18, deltaSlide=-0.18,
              sustainTime=0.09, decayTime=0.25, lpfCutoff=0.22),
    )),
    Sound("warn", 0.58, (
        layer(SAW, startFrequency=0.16, slide=-0.08, deltaSlide=-0.08, attackTime=0.015,
              sustainTime=0.10, sustainPunch=0.30, decayTime=0.20, lpfCutoff=0.30),
        layer(SINE, 0.8, startFrequency=0.10, sustainTime=0.10, decayTime=0.20, lpfCutoff=0.22),
    )),
    Sound("countdown-tick", 0.42, (
        layer(SQUARE, startFrequency=0.52, slide=-0.10, deltaSlide=-0.10, sustainTime=0.025,
              sustainPunch=0.60, decayTime=0.08, squareDuty=0.42, lpfCutoff=0.52),
        layer(SINE, 0.55, startFrequency=0.21, sustainTime=0.025, decayTime=0.09, lpfCutoff=0.32),
    )),
    Sound("countdown-final", 0.70, (
        layer(SAW, startFrequency=0.25, slide=-0.20, deltaSlide=-0.20, sustainTime=0.09,
              sustainPunch=0.52, decayTime=0.32, lpfCutoff=0.36),
        layer(SINE, 0.95, startFrequency=0.12, slide=-0.12, deltaSlide=-0.12,
              sustainTime=0.09, decayTime=0.36, lpfCutoff=0.24),
    )),
    Sound("ui-click", 0.34, (
        layer(SQUARE, startFrequency=0.48, slide=-0.08, deltaSlide=-0.08, sustainTime=0.05,
              sustainPunch=0.34, decayTime=0.12, squareDuty=0.38, lpfCutoff=0.48),
    )),
    Sound("ui-back", 0.40, (
        layer(SINE, startFrequency=0.42, slide=-0.26, deltaSlide=-0.26, sustainTime=0.04,
              sustainPunch=0.38, decayTime=0.15, lpfCutoff=0.62),
        layer(NOISE, 0.16, startFrequency=0.20, sustainTime=0.025, decayTime=0.07, lpfCutoff=0.22),
    )),
    Sound("ui-pause", 0.42, (
        layer(SINE, 1.0, 0.0, startFrequency=0.48, sustainTime=0.04, decayTime=0.13),
        layer(SINE, 0.9, 0.08, startFrequency=0.36, sustainTime=0.04, decayTime=0.15),
    )),
    Sound("ui-resume", 0.42, (
        layer(SINE, 0.9, 0.0, startFrequency=0.36, sustainTime=0.04, decayTime=0.13),
        layer(SINE, 1.0, 0.08, startFrequency=0.52, sustainTime=0.04, decayTime=0.15),
    )),
    Sound("toast", 0.38, (
        layer(SINE, startFrequency=0.55, sustainTime=0.04, sustainPunch=0.20, decayTime=0.16),
        layer(SINE, 0.72, 0.055, startFrequency=0.70, sustainTime=0.04, decayTime=0.18),
    )),
    Sound("invalid", 0.34, (
        layer(SQUARE, startFrequency=0.24, slide=-0.14, deltaSlide=-0.14, sustainTime=0.035,
              sustainPunch=0.30, decayTime=0.12, squareDuty=0.58, lpfCutoff=0.32),
    )),
    Sound("power-takeout", 0.52, (
        layer(NOISE, startFrequency=0.48, slide=0.34, deltaSlide=0.0, sustainTime=0.06,
              decayTime=0.22, lpfCutoff=0.58, hpfCutoff=0.14),
        layer(SINE, 0.72, startFrequency=0.34, slide=0.28, sustainTime=0.05, decayTime=0.20),
    )),
    Sound("power-complete", 0.64, tuple(
        layer(SINE, 1.0, at, startFrequency=freq, sustainTime=0.045, decayTime=0.16)
        for at, freq in ((0.0, 0.40), (0.055, 0.50), (0.11, 0.63), (0.17, 0.78))
    )),
    Sound("power-shuffle", 0.58, (
        layer(NOISE, startFrequency=0.36, slide=0.14, sustainTime=0.20, decayTime=0.32,
              repeatSpeed=0.54, phaserOffset=0.18, phaserSweep=-0.22, lpfCutoff=0.46),
        layer(SQUARE, 0.38, startFrequency=0.27, slide=0.10, sustainTime=0.12, decayTime=0.28,
              repeatSpeed=0.48, squareDuty=0.32, dutySweep=0.36, lpfCutoff=0.38),
    )),
    Sound("win", 0.68, tuple(
        layer(SINE if index < 4 else SQUARE, 1.0 if index < 4 else 0.48, index * 0.085,
              startFrequency=freq, sustainTime=0.10, sustainPunch=0.20, decayTime=0.42,
              squareDuty=0.42, lpfCutoff=0.80)
        for index, freq in enumerate((0.42, 0.52, 0.65, 0.82, 0.98))
    )),
    Sound("fail", 0.66, tuple(
        layer(SINE, 1.0, index * 0.18, startFrequency=freq, sustainTime=0.11,
              decayTime=0.44, lpfCutoff=0.54)
        for index, freq in enumerate((0.43, 0.34, 0.25))
    ) + (
        layer(NOISE, 0.22, 0.36, startFrequency=0.18, sustainTime=0.07,
              decayTime=0.44, lpfCutoff=0.16),
    )),
)


def write_rfx(path: Path, params: dict[str, float | int]) -> None:
    values = {**DEFAULTS, **params}
    if values["slide"] < values["deltaSlide"]:
        raise ValueError(f"{path}: deltaSlide 必须小于等于 slide")
    payload = struct.pack("<ii22f", *(values[name] for name in FIELDS))
    path.write_bytes(b"rFX " + struct.pack("<HH", 200, 96) + payload)


def read_wav(path: Path) -> tuple[int, list[float]]:
    with wave.open(str(path), "rb") as wav:
        if wav.getnchannels() != 1 or wav.getsampwidth() != 2:
            raise ValueError(f"{path} 必须是 16-bit mono WAV")
        rate = wav.getframerate()
        pcm = array.array("h", wav.readframes(wav.getnframes()))
    if struct.pack("=H", 1) == struct.pack(">H", 1):
        pcm.byteswap()
    return rate, [sample / 32768.0 for sample in pcm]


def write_wav(path: Path, rate: int, samples: list[float]) -> None:
    pcm = array.array("h", (round(max(-1.0, min(1.0, value)) * 32767) for value in samples))
    if struct.pack("=H", 1) == struct.pack(">H", 1):
        pcm.byteswap()
    with wave.open(str(path), "wb") as wav:
        wav.setparams((1, 2, rate, len(pcm), "NONE", "not compressed"))
        wav.writeframes(pcm.tobytes())


def render(args: argparse.Namespace, work: Path, jobs: list[str]) -> None:
    if args.ssh:
        remote = "/tmp/triple-pile-rfx"
        subprocess.run(["ssh", "-F", "/dev/null", args.ssh, f"rm -rf {remote} && mkdir -p {remote}"], check=True)
        subprocess.run(["scp", "-F", "/dev/null", *[str(PRESETS / f"{job}.rfx") for job in jobs],
                        f"{args.ssh}:{remote}/"], check=True)
        command = (f'cd {remote} && for f in *.rfx; do {MAC_RFXGEN} --input "$f" '
                   '--output "${f%.rfx}.wav" --format 44100,16,1 >/dev/null; done')
        subprocess.run(["ssh", "-F", "/dev/null", args.ssh, command], check=True)
        subprocess.run(["scp", "-F", "/dev/null", f"{args.ssh}:{remote}/*.wav", str(work)], check=True)
        return
    for job in jobs:
        subprocess.run([args.rfxgen, "--input", str(PRESETS / f"{job}.rfx"),
                        "--output", str(work / f"{job}.wav"), "--format", "44100,16,1"], check=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--ssh")
    target.add_argument("--rfxgen")
    args = parser.parse_args()

    PRESETS.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    jobs: list[str] = []
    for sound in SOUNDS:
        for index, item in enumerate(sound.layers, 1):
            job = sound.name if len(sound.layers) == 1 else f"{sound.name}-{index}"
            write_rfx(PRESETS / f"{job}.rfx", item.params)
            jobs.append(job)
    print(f"写出 {len(jobs)} 个 rFXGen 预设")

    with tempfile.TemporaryDirectory(prefix="triple-pile-rfx-") as directory:
        work = Path(directory)
        render(args, work, jobs)
        for sound in SOUNDS:
            rendered = []
            for index, item in enumerate(sound.layers, 1):
                job = sound.name if len(sound.layers) == 1 else f"{sound.name}-{index}"
                rate, samples = read_wav(work / f"{job}.wav")
                rendered.append((item, rate, samples))
            rate = rendered[0][1]
            length = max(round(item.at * rate) + len(samples) for item, _, samples in rendered)
            mix = [0.0] * length
            for item, layer_rate, samples in rendered:
                if layer_rate != rate:
                    raise ValueError(f"{sound.name}: 采样率不一致")
                offset = round(item.at * rate)
                for index, value in enumerate(samples):
                    mix[offset + index] += value * item.gain
            maximum = max((abs(value) for value in mix), default=1.0)
            scale = sound.peak / maximum if maximum else 1.0
            fade = max(1, round(rate * 0.002))
            for index, value in enumerate(mix):
                envelope = 1.0
                if index < fade:
                    envelope *= index / fade
                if index >= length - fade:
                    envelope *= (length - 1 - index) / fade
                mix[index] = value * scale * max(0.0, envelope)
            write_wav(OUT / f"{sound.name}.wav", rate, mix)
            rms = math.sqrt(sum(value * value for value in mix) / max(1, len(mix)))
            print(f"✔ {sound.name:18} {length / rate:5.2f}s  peak {sound.peak:.2f}  rms {rms:.3f}")

    print(f"\n输出目录：{OUT}")


if __name__ == "__main__":
    main()
