"""批量跑全部槽位：生成绿幕单体图 → 立即抠透明 → 记录质量指标。

串行执行（实例并发 22 张时崩溃过，见 HANDOFF.md），单个槽位失败不中断整批。
用法: python3 batch_run.py [slot_key ...]   不带参数则跑 slots.py 里的全部槽位。
"""
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from chroma_key import chroma_key  # noqa: E402
from slots import GREEN, SLOTS      # noqa: E402

HERE = Path(__file__).resolve().parent
DESIGN = HERE.parent
ROOT = DESIGN.parents[3]
SCRIPT = ROOT / ".tmp" / "comfy" / "comfy_qwen_edit.py"
RAW = HERE / "raw"
OUT = DESIGN / "greenscreen-assets"


def run_slot(key: str, cfg: dict) -> dict:
    fname = key.replace(".", "-")
    ref = DESIGN / cfg["ref"]
    if not ref.exists():
        return {"slot": key, "status": "error", "detail": f"ref missing: {cfg['ref']}"}

    w, h = cfg["size"]
    prompt = cfg["desc"] + GREEN
    cmd = [sys.executable, str(SCRIPT), str(RAW), fname, prompt,
           str(w), str(h), cfg["seeds"], str(ref)]
    t0 = time.time()
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    if proc.returncode != 0:
        return {"slot": key, "status": "error", "detail": proc.stderr.strip()[-300:]}

    results = []
    for seed in cfg["seeds"].split(","):
        src = RAW / f"{fname}_{seed}.png"
        if not src.exists():
            results.append({"seed": seed, "status": "missing"})
            continue
        dst = OUT / f"{fname}_{seed}.png"
        stats = chroma_key(src, dst)
        stats.update(seed=seed, status="ok")
        results.append(stats)
    return {"slot": key, "status": "ok", "secs": round(time.time() - t0, 1), "results": results}


def main():
    keys = sys.argv[1:] or list(SLOTS)
    RAW.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    report = []
    for i, key in enumerate(keys, 1):
        print(f"[{i}/{len(keys)}] {key} ...", flush=True)
        try:
            r = run_slot(key, SLOTS[key])
        except Exception as exc:                      # noqa: BLE001
            r = {"slot": key, "status": "error", "detail": f"{type(exc).__name__}: {exc}"}
        report.append(r)
        if r["status"] == "ok":
            bad = [x for x in r["results"]
                   if x.get("status") != "ok" or x.get("residual_green_px", 0) > 200
                   or x.get("transparent_nonzero_rgb", 0) > 0 or x.get("touches_edge")]
            flag = f"  ⚠ {len(bad)} 张需复查" if bad else "  ✓"
            print(f"    done {r['secs']}s{flag}", flush=True)
        else:
            print(f"    ERROR {r['detail'][:160]}", flush=True)
        (HERE / "batch_report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    ok = sum(1 for r in report if r["status"] == "ok")
    print(f"\n完成 {ok}/{len(keys)} 个槽位，报告见 batch_report.json", flush=True)


if __name__ == "__main__":
    main()
