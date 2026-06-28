#!/usr/bin/env python3
"""Build a Korea NAVER-all XMLTV file with epg2xml.

The epg2xml package already supports MY_CHANNELS="*" to request every
available service channel for a provider. This wrapper creates a narrow config
that enables NAVER only, runs epg2xml, validates the result, and writes a
gzip-compressed XMLTV artifact plus metadata.
"""

from __future__ import annotations

import argparse
import gzip
import json
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path


def run(cmd: list[str], cwd: Path) -> None:
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, cwd=cwd, check=True)


def write_config(path: Path, fetch_days: int) -> None:
    config = {
        "GLOBAL": {
            "ENABLED": False,
            "FETCH_LIMIT": fetch_days,
            "ID_FORMAT": "kr-naver-{ServiceId}",
            "ADD_REBROADCAST_TO_TITLE": False,
            "ADD_EPNUM_TO_TITLE": True,
            "ADD_DESCRIPTION": True,
            "ADD_XMLTV_NS": False,
            "ADD_CHANNEL_ICON": True,
            "HTTP_PROXY": None,
        },
        "NAVER": {
            "ENABLED": True,
            "MY_CHANNELS": "*",
        },
    }
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def xml_counts(xml: str) -> dict[str, int]:
    return {
        "channels": xml.count("<channel id="),
        "programmes": xml.count("<programme "),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Korea NAVER-all XMLTV with epg2xml")
    parser.add_argument("--workdir", default="build/epg2xml-korea-naver")
    parser.add_argument("--output", default="build/epg/korea-naver.xml.gz")
    parser.add_argument("--metadata", default="build/epg/korea-naver.metadata.json")
    parser.add_argument("--fetch-days", type=int, default=2)
    args = parser.parse_args()

    if args.fetch_days < 1 or args.fetch_days > 7:
        raise SystemExit("--fetch-days must be between 1 and 7")

    workdir = Path(args.workdir).resolve()
    output = Path(args.output).resolve()
    metadata = Path(args.metadata).resolve()
    xml_path = output.with_suffix("")
    config_path = workdir / "epg2xml.json"
    channel_path = workdir / "Channel.json"

    workdir.mkdir(parents=True, exist_ok=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    metadata.parent.mkdir(parents=True, exist_ok=True)
    write_config(config_path, args.fetch_days)

    base_cmd = [sys.executable, "-m", "epg2xml"]
    common_args = [
        "--config",
        str(config_path),
        "--channelfile",
        str(channel_path),
        "--loglevel",
        "INFO",
    ]

    run([*base_cmd, "update_channels", *common_args], workdir)
    run([*base_cmd, "run", *common_args, "--xmlfile", str(xml_path)], workdir)

    xml = xml_path.read_text(encoding="utf-8")
    counts = xml_counts(xml)
    if "<tv" not in xml or counts["channels"] == 0 or counts["programmes"] == 0:
        raise SystemExit(f"Generated XMLTV looks empty or invalid: {counts}")

    with gzip.open(output, "wb", compresslevel=9) as gz:
        gz.write(xml.encode("utf-8"))

    meta = {
        "provider": "NAVER",
        "channelSelection": "all",
        "fetchDays": args.fetch_days,
        "generatedAt": datetime.now(UTC).isoformat(),
        "sourceProject": "https://github.com/epg2xml/epg2xml",
        "output": output.name,
        **counts,
        "xmlBytes": len(xml.encode("utf-8")),
        "gzipBytes": output.stat().st_size,
    }
    metadata.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(meta, ensure_ascii=False, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
