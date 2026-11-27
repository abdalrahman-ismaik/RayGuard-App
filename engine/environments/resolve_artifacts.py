"""Maintainer tool: freeze CPython 3.11 Windows wheels from official metadata.

Downloads metadata and the bounded fork source archive, never model/package wheels.
Review changes and rerun uv dependency checks and real qualification before release.
"""

import hashlib
import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FORK = "453c6e38a51e9d1d5a2aa5fb7f1014a711913397"
LIMIT = 32 * 1024 * 1024


def fetch(url):
    with urllib.request.urlopen(url, timeout=40) as response:
        data = response.read(LIMIT + 1)
    if len(data) > LIMIT:
        raise ValueError("Metadata/source exceeded 32 MiB bound")
    return data


def pypi_artifact(line):
    name, version = line.split("==")
    metadata = json.loads(fetch(f"https://pypi.org/pypi/{name}/{version}/json"))
    endings = ["cp311-cp311-win_amd64.whl", "cp311-none-win_amd64.whl"]
    endings += [f"cp{v}-abi3-win_amd64.whl" for v in (311, 310, 39, 38, 37, 36)]
    endings += ["py3-none-any.whl", "py2.py3-none-any.whl"]
    for ending in endings:
        for item in metadata["urls"]:
            if item["filename"].endswith(ending) and not item["yanked"]:
                return dict(name=name, version=version, url=item["url"],
                            sha256=item["digests"]["sha256"], size=item["size"])
    raise ValueError(f"No approved wheel for {line}")


def main():
    lines = [line for line in (ROOT / "model-common.in").read_text().splitlines()
             if line and not line.startswith("#")]
    with ThreadPoolExecutor(max_workers=8) as pool:
        common = list(pool.map(pypi_artifact, lines))
    source_url = f"https://github.com/THU-MIG/yolov10/archive/{FORK}.tar.gz"
    source = fetch(source_url)
    fork = dict(name="ultralytics", version="8.1.34", url=source_url,
                sha256=hashlib.sha256(source).hexdigest(), size=len(source))
    for backend in ("cpu", "cu126", "cu128"):
        packages = list(common)
        for name, version in (("torch", "2.9.0"), ("torchvision", "0.24.0")):
            page = fetch(f"https://download.pytorch.org/whl/{backend}/{name}/").decode()
            filename = re.escape(f"{name}-{version}%2B{backend}-cp311-cp311-win_amd64.whl")
            match = re.search(r'href="([^"]*' + filename + r')#sha256=([0-9a-f]{64})"', page)
            if not match:
                raise ValueError(f"Official wheel absent: {name} {backend}")
            url, sha = match.groups()
            # The official index's R2 alias rejects some CPU HEAD requests.
            # The original publisher CDN serves the same hash-locked artifact.
            url = url.replace("https://download-r2.pytorch.org/", "https://download.pytorch.org/")
            request = urllib.request.Request(url, method="HEAD")
            with urllib.request.urlopen(request, timeout=40) as response:
                size = int(response.headers["Content-Length"])
            packages.append(dict(name=name, version=f"{version}+{backend}", url=url,
                                 sha256=sha, size=size))
        packages.append(fork)
        packages.sort(key=lambda item: item["name"])
        lock = "# Windows x64 / CPython 3.11. Exact artifacts from publisher metadata.\n"
        lock += "# Native THU-MIG fork; do not replace with stock ultralytics.\n"
        lock += "".join(f"{p['name']} @ {p['url']} --hash=sha256:{p['sha256']}\n"
                        for p in packages)
        (ROOT / f"windows-{backend}.lock").write_text(lock, encoding="utf-8", newline="\n")
        manifest = dict(schema_version=1, packages=packages,
                        download_bytes=sum(p["size"] for p in packages))
        (ROOT / f"windows-{backend}.artifacts.json").write_text(
            json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        print(backend, "bytes:", manifest["download_bytes"], "lock SHA-256:",
              hashlib.sha256(lock.encode()).hexdigest())
    print("Fork archive:", fork)


if __name__ == "__main__":
    main()
