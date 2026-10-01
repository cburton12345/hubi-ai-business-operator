import json
import os
import re
import subprocess
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "artifacts" / "launch-video" / "founder-flagship-preproduction"
OUTPUT = ROOT / "artifacts" / "launch-video" / "founder-flagship-final"
FFMPEG = Path(r"C:\Users\schem\AppData\Local\Temp\ferocity-video-tools-v2\node_modules\ffmpeg-static\ffmpeg.exe")
VOICEOVER = OUTPUT / "ferocity-founder-flagship-28s-voiceover.mp3"
MASTER = OUTPUT / "ferocity-founder-flagship-28s.mp4"


CLIPS = [
    (SOURCE / "motion-test-founder-v1.mp4", 4),
    (SOURCE / "motion-test-coordination-v1.mp4", 4),
    (SOURCE / "master-scene-proof-to-growth-v1.mp4", 12),
    (SOURCE / "master-scene-founder-decision-v1.mp4", 8),
]

VOICEOVER_TEXT = (
    "Most businesses only move when somebody keeps pushing. Leads wait. Proposals stall. "
    "Schedules shift. Invoices age. Ferocity notices what changed, understands what it affects, "
    "and keeps authorized work moving—answering inquiries, preparing next steps, coordinating teams, "
    "updating customers, collecting payment, and turning finished work into future demand. "
    "When judgment is needed, Ferocity asks. You decide. The business keeps moving. "
    "Your business, working as one. Ferocity."
)

CAPTIONS = [
    (0.2, 3.5, "Most businesses only move when somebody keeps pushing."),
    (3.5, 7.8, "Leads wait. Proposals stall. Schedules shift. Invoices age."),
    (7.8, 11.4, "Ferocity notices what changed and understands what it affects."),
    (11.4, 15.0, "Then it keeps authorized work moving."),
    (15.0, 20.5, "It coordinates teams, updates customers, collects payment—and creates future demand."),
    (20.5, 24.7, "When judgment is needed, Ferocity asks. You decide."),
    (24.7, 27.7, "Your business, working as one. Ferocity."),
]


def load_env():
    env_file = ROOT / ".env.local"
    if not env_file.exists():
        return
    for raw in env_file.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key, value.strip().strip('"').strip("'"))


def font(size, bold=False):
    filename = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / filename), size)


def rounded_text_card(text, filename, y=72, size=30, accent=False):
    canvas = Image.new("RGBA", (1280, 720), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    fnt = font(size, True)
    box = draw.textbbox((640, y), text, font=fnt, anchor="ma")
    pad_x, pad_y = 28, 18
    rect = (box[0] - pad_x, box[1] - pad_y, box[2] + pad_x, box[3] + pad_y)
    fill = (8, 26, 27, 224) if not accent else (7, 111, 99, 235)
    draw.rounded_rectangle(rect, radius=18, fill=fill, outline=(113, 232, 208, 190), width=2)
    draw.text((640, y), text, font=fnt, fill=(255, 255, 255, 255), anchor="ma")
    canvas.save(OUTPUT / filename)


def caption_card(text, filename):
    canvas = Image.new("RGBA", (1280, 720), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    fnt = font(31, True)
    max_width = 1040
    words = text.split()
    lines, current = [], ""
    for word in words:
        proposed = f"{current} {word}".strip()
        if draw.textlength(proposed, font=fnt) <= max_width:
            current = proposed
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    line_height = 41
    total_height = len(lines) * line_height
    top = 650 - total_height
    draw.rounded_rectangle((80, top - 15, 1200, 674), radius=18, fill=(4, 13, 18, 205))
    for index, line in enumerate(lines):
        draw.text((640, top + index * line_height), line, font=fnt, fill=(255, 255, 255, 255), anchor="ma")
    canvas.save(OUTPUT / filename)


def end_card():
    canvas = Image.new("RGBA", (1280, 720), (5, 22, 24, 255))
    draw = ImageDraw.Draw(canvas)
    for radius, color in [(510, (8, 43, 43, 255)), (355, (9, 64, 59, 255)), (205, (10, 91, 81, 255))]:
        draw.ellipse((640 - radius, 345 - radius, 640 + radius, 345 + radius), fill=color)
    draw.text((640, 140), "FEROCITY", font=font(38, True), fill="#8ef0dc", anchor="ma")
    draw.multiline_text(
        (640, 250), "YOUR BUSINESS.\nWORKING AS ONE.", font=font(62, True),
        fill="#ffffff", anchor="ma", align="center", spacing=8,
    )
    draw.rounded_rectangle((420, 440, 860, 520), radius=20, fill="#f4fffc")
    draw.text((640, 461), "FEROCITY.LIVE", font=font(35, True), fill="#075f56", anchor="ma")
    draw.text(
        (640, 648),
        "Created using Ferocity's marketing features. AI footage rendered through a connected provider.",
        font=font(16), fill="#b6d7d2", anchor="ma",
    )
    canvas.save(OUTPUT / "end-card-28s.png")


def create_assets():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    rounded_text_card("THE OWNER STEPPED AWAY. THE BUSINESS DIDN'T.", "message-owner.png")
    rounded_text_card("NOTICE  →  UNDERSTAND  →  COORDINATE  →  ADVANCE", "message-loop.png", accent=True)
    rounded_text_card("ONE DECISION NEEDS YOU", "message-decision.png")
    for index, (_, _, text) in enumerate(CAPTIONS):
        caption_card(text, f"caption-{index:02d}.png")
    end_card()


def create_voiceover():
    if VOICEOVER.exists() and VOICEOVER.stat().st_size > 1000:
        return
    payload = json.dumps({
        "model": "gpt-4o-mini-tts",
        "voice": "cedar",
        "input": VOICEOVER_TEXT,
        "instructions": (
            "Speak like a thoughtful, confident founder explaining a breakthrough to another business owner. "
            "Warm, grounded, conversational, and human—not a movie trailer or synthetic announcer. "
            "Use natural pauses after the short problem sentences, then build measured momentum. "
            "Land the final three sentences clearly and calmly."
        ),
        "response_format": "mp3",
    }).encode("utf-8")
    request = urllib.request.Request(
        "https://api.openai.com/v1/audio/speech",
        data=payload,
        headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        VOICEOVER.write_bytes(response.read())


def media_duration(path):
    result = subprocess.run([str(FFMPEG), "-i", str(path)], capture_output=True, text=True)
    match = re.search(r"Duration: (\d+):(\d+):(\d+(?:\.\d+)?)", result.stderr)
    if not match:
        raise RuntimeError(f"Could not determine duration for {path}")
    hours, minutes, seconds = match.groups()
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def compose():
    command = [str(FFMPEG), "-y"]
    for clip, _ in CLIPS:
        command += ["-i", str(clip)]
    overlay_files = [
        OUTPUT / "message-owner.png",
        OUTPUT / "message-loop.png",
        OUTPUT / "message-decision.png",
        OUTPUT / "end-card-28s.png",
    ] + [OUTPUT / f"caption-{index:02d}.png" for index in range(len(CAPTIONS))]
    for overlay in overlay_files:
        command += ["-loop", "1", "-framerate", "30", "-i", str(overlay)]
    narration_index = 4 + len(overlay_files)
    command += ["-i", str(VOICEOVER)]

    filters = []
    for index, (_, duration) in enumerate(CLIPS):
        filters.append(
            f"[{index}:v]trim=duration={duration},setpts=PTS-STARTPTS,scale=1280:720,fps=30,format=yuv420p,setsar=1[v{index}]"
        )
    filters.append("[v0][v1][v2][v3]concat=n=4:v=1:a=0[base]")

    filters.append("[base][4:v]overlay=0:0:enable='between(t,0.25,3.55)'[o0]")
    filters.append("[o0][5:v]overlay=0:0:enable='between(t,8.1,19.7)'[o1]")
    filters.append("[o1][6:v]overlay=0:0:enable='between(t,20.2,24.6)'[o2]")
    filters.append("[o2][7:v]overlay=0:0:enable='between(t,25.0,28.0)'[o3]")
    previous = "o3"
    for index, (start, end, _) in enumerate(CAPTIONS):
        input_index = 8 + index
        output_label = f"c{index}"
        filters.append(f"[{previous}][{input_index}:v]overlay=0:0:enable='between(t,{start},{min(end, 24.95)})'[{output_label}]")
        previous = output_label
    filters.append(f"[{previous}]fade=t=in:st=0:d=0.25,fade=t=out:st=27.7:d=0.3[outv]")

    for index, (_, duration) in enumerate(CLIPS):
        filters.append(f"[{index}:a]atrim=duration={duration},asetpts=PTS-STARTPTS[a{index}]")
    filters.append("[a0][a1][a2][a3]concat=n=4:v=0:a=1,volume=0.075,afade=t=in:st=0:d=0.4,afade=t=out:st=27.5:d=0.5[bed]")
    narration_duration = media_duration(VOICEOVER)
    tempo = max(0.8, min(1.35, narration_duration / 27.0))
    filters.append(
        f"[{narration_index}:a]atempo={tempo:.5f},adelay=150|150,volume=1.08,apad=pad_dur=1[narration]"
    )
    filters.append("[bed][narration]amix=inputs=2:duration=first:dropout_transition=0,alimiter=limit=0.95[outa]")

    command += [
        "-filter_complex", ";".join(filters),
        "-map", "[outv]", "-map", "[outa]", "-t", "28",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(MASTER),
    ]
    subprocess.run(command, check=True)


def write_sidecars():
    vtt = ["WEBVTT", ""]
    for start, end, text in CAPTIONS:
        def stamp(value):
            minutes = int(value // 60)
            seconds = value - minutes * 60
            return f"00:{minutes:02d}:{seconds:06.3f}"
        vtt += [f"{stamp(start)} --> {stamp(end)}", text, ""]
    (OUTPUT / "ferocity-founder-flagship-28s.vtt").write_text("\n".join(vtt), encoding="utf-8")
    (OUTPUT / "ferocity-founder-flagship-28s-script.txt").write_text(VOICEOVER_TEXT + "\n", encoding="utf-8")


load_env()
create_assets()
create_voiceover()
compose()
write_sidecars()
print(json.dumps({
    "video": str(MASTER),
    "duration_seconds": media_duration(MASTER),
    "voiceover_seconds": media_duration(VOICEOVER),
}, indent=2))
