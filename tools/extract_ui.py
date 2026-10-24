"""Extracts the original Flash UI art and layout so the PixiJS client can rebuild it.

Usage:
    python tools/extract_ui.py --ffdec <ffdec.jar> --java <java8 binary> --javac <javac> [--swf ...] [--out assets/ui]

FFDec (JPEXS) needs Java 8 to run; ``--javac`` only compiles tools/java/Bounds.java (any JDK, targeting 8). For every container sprite listed in CONTAINERS the tool writes the
placement of its children (frame 1) to ``layout.json`` and renders each child, flattened, to
``<id>.png``. ``chars[id].x/y`` is where the PNG's top-left sits in the child's own coordinate
space, so a Pixi sprite goes at ``child.x + child.sx * chars[id].x`` (twips are converted to px).

The output is derived from the game files, so it lives next to the other game assets (not in git).
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

# Container sprite id -> why it is extracted. 767 is the Flash HUD's top bar (parteArribaGui).
CONTAINERS = {
    767: "top bar: gold / food / cash, level + XP meter, dragon book",
    734: "XP meter (mask, background, level text, XP text)",
}

TWIPS = 20.0


def px(value) -> float:
    return int(value) / TWIPS


class Swf:
    def __init__(self, xml_path: Path):
        self.defs: dict[int, ET.Element] = {}
        for item in ET.parse(xml_path).getroot().iter("item"):
            kind = item.get("type") or ""
            char_id = item.get("shapeId") or item.get("spriteId") or item.get("characterID")
            if char_id and kind.startswith("Define") and kind != "DefineScalingGridTag":
                self.defs[int(char_id)] = item

    @staticmethod
    def matrix(place: ET.Element) -> tuple[float, float, float, float]:
        """(tx, ty, sx, sy) in px / scale; rotation is not used by the HUD art."""
        m = place.find("matrix")
        if m is None:
            return 0.0, 0.0, 1.0, 1.0
        scaled = m.get("hasScale") == "true"
        sx = int(m.get("scaleX")) / 65536 if scaled else 1.0
        sy = int(m.get("scaleY")) / 65536 if scaled else 1.0
        return px(m.get("translateX")), px(m.get("translateY")), sx, sy

    def frame1(self, sprite_id: int) -> list[ET.Element]:
        placed = []
        for tag in self.defs[sprite_id].find("subTags"):
            if tag.get("type") == "ShowFrameTag":
                break
            if tag.get("characterId") and tag.get("placeFlagMove") != "true":
                placed.append(tag)
        return placed

    def text_info(self, char_id: int) -> dict | None:
        item = self.defs.get(char_id)
        if item is None or item.get("type") != "DefineEditTextTag":
            return None
        color = item.find("textColor")
        return {
            "size": int(item.get("fontHeight")) / TWIPS,
            "align": {"0": "left", "1": "right", "2": "center"}.get(item.get("align"), "left"),
            "color": "#%02x%02x%02x" % tuple(int(color.get(c)) for c in ("red", "green", "blue")) if color is not None else "#000000",
            "text": item.get("initialText") or "",
        }


def char_bounds(opts, tmp: Path, ids: list[int]) -> dict[int, tuple[float, float, float, float]]:
    """Bounds (px) exactly as FFDec computes them when it renders a character."""
    classes = tmp / "classes"
    classes.mkdir()
    lib = Path(opts.ffdec).parent / "lib"
    subprocess.run([opts.javac, "-Xlint:-options", "--release", "8", "-cp", str(lib / "*"), "-d", str(classes),
                    str(Path(__file__).parent / "java" / "Bounds.java")], check=True)
    result = subprocess.run([opts.java, "-cp", f"{lib / '*'}{os.pathsep}{classes}", "Bounds", opts.swf,
                             *map(str, ids)], check=True, capture_output=True, text=True)
    boxes = {}
    for line in result.stdout.splitlines():
        char_id, x0, y0, x1, y1 = (int(v) for v in line.split())
        boxes[char_id] = (px(x0), px(y0), px(x1), px(y1))
    return boxes


def run_ffdec(java: str, jar: str, *args: str) -> None:
    subprocess.run([java, "-jar", jar, *args], check=True, stdout=subprocess.DEVNULL)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ffdec", required=True, help="path to ffdec.jar")
    parser.add_argument("--java", default="java", help="a Java 8 binary")
    parser.add_argument("--javac", default="javac")
    parser.add_argument("--swf", default="flash/versions/Base_sec_2.2.5.swf")
    parser.add_argument("--font-swf", default="assets/fonts/en_CurseCasual3.swf",
                        help='embedded font of the UI ("Curse Casual JVE"), exported to <out>/CurseCasual.ttf')
    parser.add_argument("--out", default="assets/ui")
    opts = parser.parse_args()

    out = Path(opts.out)
    out.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        xml_path = Path(tmp) / "swf.xml"
        run_ffdec(opts.java, opts.ffdec, "-swf2xml", opts.swf, str(xml_path))
        swf = Swf(xml_path)

        fonts = Path(tmp) / "fonts"
        run_ffdec(opts.java, opts.ffdec, "-format", "font:ttf", "-export", "font", str(fonts), opts.font_swf)
        shutil.copyfile(next(fonts.glob("*.ttf")), out / "CurseCasual.ttf")

        placements: dict[int, list[dict]] = {}
        for container_id in CONTAINERS:
            placements[container_id] = [
                {"id": int(tag.get("characterId")), "name": tag.get("name"), "depth": int(tag.get("depth")),
                 **dict(zip(("x", "y", "sx", "sy"), swf.matrix(tag)))}
                for tag in swf.frame1(container_id)
            ]
        ids = sorted({child["id"] for children in placements.values() for child in children})
        boxes = char_bounds(opts, Path(tmp), ids)

        chars: dict[str, dict] = {}
        for char_id, box in boxes.items():
            geometry = {"x": box[0], "y": box[1], "w": box[2] - box[0], "h": box[3] - box[1]}
            text = swf.text_info(char_id)
            chars[str(char_id)] = {"kind": "text", **text, **geometry} if text else {"kind": "image", **geometry}

        render = Path(tmp) / "render"
        for export, prefix in (("sprite", "DefineSprite"), ("shape", "")):
            wanted = [i for i, c in chars.items() if c["kind"] == "image"
                      and (swf.defs[int(i)].get("type") == "DefineSpriteTag") == (export == "sprite")]
            if not wanted:
                continue
            run_ffdec(opts.java, opts.ffdec, "-selectid", ",".join(wanted), "-format", f"{export}:png",
                      "-export", export, str(render / export), opts.swf)
            for char_id in wanted:
                if export == "sprite":
                    folder = next((render / export).glob(f"{prefix}_{char_id}_*"), None)                         or (render / export) / f"{prefix}_{char_id}"
                    frame = folder / "1.png"
                else:
                    frame = (render / export) / f"{char_id}.png"
                if frame.exists():
                    shutil.copyfile(frame, out / f"{char_id}.png")
                else:
                    chars.pop(char_id)
        containers = {str(cid): {"children": sorted(children, key=lambda c: c["depth"])}
                      for cid, children in placements.items()}

    (out / "layout.json").write_text(json.dumps({"containers": containers, "chars": chars}, indent=1))
    print(f"wrote {len(chars)} characters to {out}")


if __name__ == "__main__":
    main()
