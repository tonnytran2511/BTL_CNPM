"""Package the committed source and verified presentation assets, without local secrets.

Run after committing the delivery candidate. Python 3 standard library only.
"""

import hashlib
import io
import json
import pathlib
import subprocess
import tarfile
import zipfile
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUTPUT = ROOT / ".local" / "submission"
OUTPUT.mkdir(parents=True, exist_ok=True)
ASSETS = {
    "Bao-cao.pdf": ROOT / "demo/delivery/Smart-E-Mobility-Hub-report.pdf",
    "Trinh-bay.pptx": ROOT / "demo/delivery/Smart-E-Mobility-Hub-final.pptx",
    "Demo-3-phut.mp4": ROOT / "demo/delivery/Smart-E-Mobility-Hub-demo.mp4",
    "Demo-3-phut.srt": ROOT / "demo/delivery/Smart-E-Mobility-Hub-demo.srt",
}
for source in ASSETS.values():
    if not source.is_file() or source.stat().st_size == 0:
        raise SystemExit(f"Missing delivery asset: {source.relative_to(ROOT)}")
revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
archive = subprocess.check_output(["git", "archive", "--format=tar", revision], cwd=ROOT)
files = {}
with tarfile.open(fileobj=io.BytesIO(archive)) as source:
    for member in source.getmembers():
        if not member.isfile():
            continue
        name = pathlib.PurePosixPath(member.name)
        if name.is_absolute() or ".." in name.parts:
            raise SystemExit("Unsafe archive path")
        if any(part in {".git", ".local", "node_modules"} for part in name.parts):
            raise SystemExit(f"Private/build directory tracked in source: {name}")
        if any(part.startswith(".env") and part != ".env.example" for part in name.parts):
            raise SystemExit(f"Environment secret tracked in source: {name}")
        # Final artifacts sit once at the bundle root; retain evidence in source.
        if str(name).startswith("demo/delivery/"):
            continue
        files[f"source/{name}"] = source.extractfile(member).read()
for name, source in ASSETS.items():
    files[name] = source.read_bytes()
files["HUONG-DAN.txt"] = (
    "SMART E-MOBILITY HUB - CNPM HK261\n"
    f"Source commit: {revision}\n\n"
    "1. Bao-cao.pdf: bao cao he thong, UML/ERD, ket qua test va khai bao AI.\n"
    "2. Trinh-bay.pptx: 10 slide, speaker notes; phat MP4 di kem o slide 9.\n"
    "3. Demo-3-phut.mp4: video 180 giay, H.264/AAC; giong doc tong hop Linh.\n"
    "4. Demo-3-phut.srt: phu de tieng Viet; video cung co tieu de tung canh.\n"
    "5. source/: ma nguon, lockfile, migration, tai lieu va bang chung.\n\n"
    "CAI MOI: Node >=22.13; cd source; npm ci; npm run setup:env;\n"
    "npm run build; npm test. Demo DB tam: npm run demo:t14.\n"
    "Quay lai: npx playwright install chromium; npm run demo:record.\n"
    "Xem README.md va docs/reports/week2-week3-delivery.md de biet pham vi/gioi han.\n"
    "File nay chua phai bien nhan nop. Can nop dung cong/han giang vien cong bo.\n"
).encode("utf-8")
manifest = {
    "createdAt": datetime.now(timezone.utc).isoformat(),
    "sourceCommit": revision,
    "officialSubmission": False,
    "files": [
        {"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
        for name, data in sorted(files.items())
    ],
}
files["MANIFEST.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
destination = OUTPUT / "Smart-E-Mobility-Hub-submission.zip"
with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as bundle:
    for name, data in sorted(files.items()):
        bundle.writestr(name, data)
# Read the actual ZIP back and check every payload, paths and CRC.
with zipfile.ZipFile(destination) as bundle:
    assert bundle.testzip() is None
    assert set(bundle.namelist()) == set(files)
    for item in manifest["files"]:
        assert hashlib.sha256(bundle.read(item["path"])).hexdigest() == item["sha256"]
checksum = hashlib.sha256(destination.read_bytes()).hexdigest()
(OUTPUT / "SHA256SUMS.txt").write_text(f"{checksum}  {destination.name}\n", encoding="utf-8")
print(json.dumps({"archive": str(destination), "sourceCommit": revision,
                  "files": len(files), "bytes": destination.stat().st_size,
                  "sha256": checksum}, indent=2))
