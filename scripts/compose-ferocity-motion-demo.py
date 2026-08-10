import json
import math
import os
import subprocess
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "launch-video" / "motion-demo"
FFMPEG = Path(os.environ.get("FEROCITY_FFMPEG", r"C:\Users\schem\AppData\Local\Temp\ferocity-video-tools\node_modules\ffmpeg-static\ffmpeg.exe"))
WIDTH, HEIGHT, FPS = 1280, 720, 24
INK = "#10202a"
MUTED = "#58707a"
TEAL = "#0d7c70"
MINT = "#5ee0c1"
PANEL = "#ffffff"
NAVY = "#071720"
BG = "#eef4f3"


def load_env():
    env_file = ROOT / ".env.local"
    if not env_file.exists():
        return
    for raw in env_file.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key, value.strip().strip('"').strip("'"))


def font(size, bold=False):
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / ("segoeuib.ttf" if bold else "segoeui.ttf")), size)


def ease(value):
    value = max(0.0, min(1.0, value))
    return 1 - (1 - value) ** 3


def clamp(value, low=0.0, high=1.0):
    return max(low, min(high, value))


def phase(progress, start, end):
    return ease(clamp((progress - start) / max(0.001, end - start)))


def rounded(draw, box, radius=20, fill=PANEL, outline=None, width=1):
    draw.rounded_rectangle(tuple(int(v) for v in box), radius, fill=fill, outline=outline, width=width)


def text(draw, xy, value, size, fill=INK, bold=False, anchor=None):
    draw.text(xy, value, font=font(size, bold), fill=fill, anchor=anchor)


def wrapped(draw, xy, value, size, max_width, fill=INK, bold=False, spacing=7):
    words, lines, current = value.split(), [], ""
    selected = font(size, bold)
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and draw.textbbox((0, 0), candidate, font=selected)[2] > max_width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    draw.multiline_text(xy, "\n".join(lines), font=selected, fill=fill, spacing=spacing)


def base(title, kicker, step, progress):
    image = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, WIDTH, 72), fill="#f9fcfb")
    text(draw, (34, 24), "FEROCITY", 24, TEAL, True)
    text(draw, (1245, 28), "THE BUSINESS LOOP", 15, MUTED, True, "ra")
    draw.rectangle((0, 70, int(WIDTH * progress), 74), fill=MINT)
    text(draw, (42, 112), f"{step:02d}  {kicker.upper()}", 18, TEAL, True)
    wrapped(draw, (42, 152), title, 46, 440, INK, True, 6)
    text(draw, (42, 655), "ILLUSTRATIVE PRODUCT DEMO  •  FEROCITY.LIVE", 14, MUTED, True)
    return image, draw


def status_badge(draw, xy, label, color=MINT, ink="#07332d"):
    x, y = xy
    badge_font = font(16, True)
    width = draw.textbbox((0, 0), label, font=badge_font)[2] + 30
    rounded(draw, (x, y, x + width, y + 38), 12, color)
    text(draw, (x + 15, y + 9), label, 16, ink, True)


def metric(draw, box, label, value, accent=TEAL):
    rounded(draw, box, 18, "#f7faf9", "#d8e4e1", 2)
    x1, y1, x2, _ = box
    text(draw, (x1 + 18, y1 + 14), label, 15, MUTED, True)
    text(draw, (x1 + 18, y1 + 47), value, 30, accent, True)
    draw.rectangle((x1 + 18, y1 + 88, x2 - 18, y1 + 94), fill="#dce9e6")
    draw.rectangle((x1 + 18, y1 + 88, x1 + 18 + int((x2 - x1 - 36) * 0.76), y1 + 94), fill=accent)


def scene_opportunity(p, timeline):
    image, draw = base("Ferocity finds the next opportunity.", "Business awareness", 1, timeline)
    x = int(505 + (1 - phase(p, 0.0, 0.22)) * 70)
    rounded(draw, (x, 105, 1235, 630), 28, NAVY)
    text(draw, (x + 34, 136), "GROWTH SIGNAL DETECTED", 16, MINT, True)
    text(draw, (x + 34, 178), "Storm demand is rising.", 35, "#ffffff", True)
    text(draw, (x + 34, 224), "Tomorrow still has capacity.", 24, "#c8d8dc")
    reveal = phase(p, 0.18, 0.48)
    metrics = [("Search demand", f"+{round(31 * reveal)}%"), ("Open crew hours", f"{round(16 * reveal)}"), ("Approved proof", f"{round(9 * reveal)} jobs")]
    for i, (label, value) in enumerate(metrics):
        metric(draw, (x + 34 + i * 218, 292, x + 228 + i * 218, 405), label, value, MINT)
    if p > 0.52:
        status_badge(draw, (x + 34, 454), "Next move prepared")
        text(draw, (x + 34, 510), "Campaign plan, audience, offer, and budget are ready.", 20, "#d3e3e5")
    return image


def scene_campaign(p, timeline):
    image, draw = base("The campaign assembles and launches.", "Authorized growth", 2, timeline)
    rounded(draw, (500, 104, 1235, 632), 28, PANEL, "#d5e1df", 2)
    text(draw, (536, 135), "CAMPAIGN  •  STORM-READY ROOFING", 17, TEAL, True)
    channels = [("Search page", "SEO + GEO", 0.05), ("Google campaign", "Approved budget", 0.18), ("Social ad", "Project proof", 0.31), ("Past customers", "Reactivation", 0.44)]
    for index, (name, detail, start) in enumerate(channels):
        reveal = phase(p, start, start + 0.2)
        y = 195 + index * 93
        offset = int((1 - reveal) * 80)
        rounded(draw, (536 + offset, y, 1198 + offset, y + 72), 17, "#f5f9f8", "#dce8e5", 2)
        draw.ellipse((556 + offset, y + 20, 588 + offset, y + 52), fill=MINT)
        text(draw, (601 + offset, y + 15), name, 19, INK, True)
        text(draw, (601 + offset, y + 42), detail, 15, MUTED)
        if reveal > 0.88:
            status_badge(draw, (1022 + offset, y + 17), "LIVE", "#d9f8ef", TEAL)
    return image


def scene_call(p, timeline):
    image, draw = base("A homeowner responds. Ferocity is already there.", "AI receptionist", 3, timeline)
    rounded(draw, (545, 104, 925, 635), 38, "#0b1b27")
    text(draw, (735, 140), "INCOMING CALL", 16, MINT, True, "ma")
    text(draw, (735, 184), "Storm roof repair", 29, "#ffffff", True, "ma")
    text(draw, (735, 224), "Eau Claire  •  New lead", 17, "#a8bec5", False, "ma")
    wave = phase(p, 0.08, 0.28)
    for i in range(36):
        h = 8 + abs(math.sin(i * 0.62 + p * 34)) * 54 * wave
        x = 575 + i * 9
        draw.rounded_rectangle((x, 332 - h / 2, x + 5, 332 + h / 2), 3, fill=MINT)
    transcript = [
        ("Ferocity", "Thanks for calling. What happened?"),
        ("Customer", "Wind lifted shingles over the garage."),
        ("Ferocity", "I can help. Is water entering now?"),
    ]
    for index, (speaker, line) in enumerate(transcript):
        reveal = phase(p, 0.24 + index * 0.19, 0.39 + index * 0.19)
        if reveal <= 0:
            continue
        y = 402 + index * 65
        text(draw, (575, y), speaker, 14, MINT if speaker == "Ferocity" else "#f4c46c", True)
        shown = line[: max(1, int(len(line) * reveal))]
        text(draw, (575, y + 23), shown, 17, "#ffffff")
    if p > 0.68:
        rounded(draw, (962, 194, 1218, 490), 24, PANEL, "#d6e2df", 2)
        text(draw, (990, 220), "LEAD UNDERSTOOD", 15, TEAL, True)
        for y, label, value in [(270, "Urgency", "High"), (326, "Service fit", "Yes"), (382, "Consent", "Captured")]:
            text(draw, (990, y), label, 14, MUTED)
            text(draw, (1188, y), value, 17, INK, True, "ra")
        status_badge(draw, (990, 430), "Estimate next")
    return image


def scene_estimate(p, timeline):
    image, draw = base("The estimate moves instead of becoming a task.", "Opportunity advanced", 4, timeline)
    rounded(draw, (500, 103, 1218, 635), 25, PANEL, "#d6e2df", 2)
    text(draw, (535, 135), "ESTIMATE  #1048", 17, TEAL, True)
    text(draw, (535, 174), "Emergency roof repair", 31, INK, True)
    items = [("Emergency tarp and mobilization", 485), ("Replace damaged shingles", 1380), ("Seal flashing and inspect deck", 620)]
    for index, (label, amount) in enumerate(items):
        reveal = phase(p, 0.1 + index * 0.15, 0.28 + index * 0.15)
        y = 252 + index * 72
        draw.line((535, y + 52, 1180, y + 52), fill="#e1e9e7", width=2)
        text(draw, (535, y), label[: max(1, int(len(label) * reveal))], 19, INK)
        if reveal > 0.8:
            text(draw, (1178, y), f"${amount:,}", 19, INK, True, "ra")
    if p > 0.57:
        total = int(2485 * phase(p, 0.57, 0.75))
        text(draw, (975, 495), "TOTAL", 16, MUTED, True)
        text(draw, (1178, 485), f"${total:,}", 34, TEAL, True, "ra")
    if p > 0.78:
        status_badge(draw, (535, 548), "Sent and watched")
        status_badge(draw, (760, 548), "Customer accepted", "#d9f8ef", TEAL)
    return image


def scene_schedule(p, timeline):
    image, draw = base("The customer, crew, and schedule move together.", "Operations coordinated", 5, timeline)
    rounded(draw, (500, 104, 1218, 635), 25, PANEL, "#d6e2df", 2)
    text(draw, (535, 137), "TOMORROW  •  CREW SCHEDULE", 17, TEAL, True)
    for hour, y in [("8 AM", 220), ("10 AM", 318), ("12 PM", 416), ("2 PM", 514)]:
        text(draw, (535, y), hour, 15, MUTED, True)
        draw.line((600, y + 10, 1180, y + 10), fill="#e1e9e7", width=2)
    move = phase(p, 0.12, 0.42)
    x = int(1120 - move * 475)
    rounded(draw, (x, 292, x + 420, 372), 18, "#0d7c70")
    text(draw, (x + 20, 307), "10:00  •  Emergency roof repair", 18, "#ffffff", True)
    text(draw, (x + 20, 339), "Assigned to Alex  •  Materials ready", 15, "#d4f5ee")
    if p > 0.5:
        rounded(draw, (820, 455, 1180, 580), 20, NAVY)
        text(draw, (848, 478), "CUSTOMER UPDATED", 14, MINT, True)
        wrapped(draw, (848, 511), "Your technician is scheduled for tomorrow at 10:00 AM.", 18, 300, "#ffffff")
    return image


def scene_completion(p, timeline):
    image, draw = base("Field proof starts the money loop.", "Job completed", 6, timeline)
    rounded(draw, (500, 104, 1218, 635), 25, NAVY)
    text(draw, (535, 137), "JOB  #1048  •  FIELD UPDATE", 17, MINT, True)
    for index in range(3):
        reveal = phase(p, 0.08 + index * 0.16, 0.3 + index * 0.16)
        x = 535 + index * 212
        y = int(230 + (1 - reveal) * 70)
        rounded(draw, (x, y, x + 188, y + 180), 17, "#d8e5e4")
        draw.rectangle((x + 12, y + 12, x + 176, y + 122), fill=["#687d87", "#526d66", "#7a6f5f"][index])
        draw.polygon((x + 20, y + 112, x + 95, y + 48, x + 166, y + 112), fill=["#243d47", "#244a40", "#504333"][index])
        text(draw, (x + 16, y + 139), ["Before", "Repair", "Completed"][index], 16, INK, True)
    if p > 0.64:
        status_badge(draw, (535, 500), "Employee marked complete")
        status_badge(draw, (820, 500), "Proof approved", "#d9f8ef", TEAL)
        text(draw, (535, 565), "Photos  •  time  •  forms  •  completion notes", 18, "#cbdde0")
    return image


def scene_money(p, timeline):
    image, draw = base("Revenue, cost, and profit update together.", "Money advanced", 7, timeline)
    rounded(draw, (500, 104, 1218, 635), 25, PANEL, "#d6e2df", 2)
    text(draw, (535, 137), "JOB PROFITABILITY  •  #1048", 17, TEAL, True)
    values = [("Invoice", 2485, TEAL), ("Labor", 522, "#c47735"), ("Materials", 681, "#c47735"), ("Gross profit", 1282, "#16835f")]
    for index, (label, amount, color) in enumerate(values):
        reveal = phase(p, 0.08 + index * 0.15, 0.28 + index * 0.15)
        x = 535 + (index % 2) * 325
        y = 210 + (index // 2) * 150
        rounded(draw, (x, y, x + 285, y + 120), 18, "#f6faf9", "#dbe7e4", 2)
        text(draw, (x + 18, y + 17), label, 16, MUTED, True)
        text(draw, (x + 18, y + 50), f"${int(amount * reveal):,}", 32, color, True)
    if p > 0.72:
        status_badge(draw, (535, 528), "Connected payment recorded")
        text(draw, (850, 538), "P&L updated", 18, TEAL, True)
    return image


def scene_compound(p, timeline):
    image, draw = base("The result becomes the next campaign.", "Growth compounded", 8, timeline)
    rounded(draw, (500, 104, 1218, 635), 25, NAVY)
    text(draw, (535, 137), "APPROVED JOB PROOF", 17, MINT, True)
    source_x = 555
    rounded(draw, (source_x, 215, source_x + 185, 405), 18, "#d6e3df")
    draw.rectangle((source_x + 12, 228, source_x + 173, 348), fill="#65756a")
    draw.polygon((source_x + 18, 338, source_x + 90, 270, source_x + 166, 338), fill="#243f36")
    text(draw, (source_x + 18, 365), "Completed job", 16, INK, True)
    outputs = [("Review request", "5-star proof"), ("Social ad", "Before + after"), ("SEO / GEO", "Local project page")]
    for index, (label, detail) in enumerate(outputs):
        reveal = phase(p, 0.2 + index * 0.17, 0.42 + index * 0.17)
        x = int(1135 - reveal * 330)
        y = 200 + index * 120
        draw.line((740, 310, x, y + 42), fill="#4d857d", width=4)
        rounded(draw, (x, y, x + 320, y + 85), 17, "#f4faf8")
        text(draw, (x + 18, y + 15), label, 18, TEAL, True)
        text(draw, (x + 18, y + 48), detail, 15, MUTED)
    if p > 0.75:
        status_badge(draw, (555, 490), "Next campaign prepared")
    return image


def scene_owner(p, timeline):
    image, draw = base("Ferocity continues. The owner handles what matters.", "Business loop", 9, timeline)
    nodes = ["MARKET", "LEAD", "ESTIMATE", "SCHEDULE", "COMPLETE", "PAY", "PROVE", "GROW"]
    center = (850, 345)
    radius = 240
    for index, label in enumerate(nodes):
        angle = -math.pi / 2 + index * math.pi * 2 / len(nodes)
        next_angle = -math.pi / 2 + (index + 1) * math.pi * 2 / len(nodes)
        x, y = center[0] + math.cos(angle) * radius, center[1] + math.sin(angle) * radius
        nx, ny = center[0] + math.cos(next_angle) * radius, center[1] + math.sin(next_angle) * radius
        draw.line((x, y, nx, ny), fill="#72a99f", width=5)
        active = index <= int(p * len(nodes))
        fill = MINT if active else "#dce8e5"
        rounded(draw, (x - 70, y - 27, x + 70, y + 27), 18, fill)
        text(draw, (x, y - 9), label, 14, "#07352f" if active else MUTED, True, "ma")
    rounded(draw, (690, 265, 1010, 425), 25, NAVY)
    text(draw, (850, 296), "FEROCITY", 20, MINT, True, "ma")
    text(draw, (850, 342), f"{int(12 * phase(p, 0.1, 0.62))} actions completed", 29, "#ffffff", True, "ma")
    text(draw, (850, 386), "1 decision needs you", 19, "#d4e5e6", False, "ma")
    return image


def scene_end(p, timeline):
    image = Image.new("RGB", (WIDTH, HEIGHT), NAVY)
    draw = ImageDraw.Draw(image)
    pulse = 1 + math.sin(p * math.pi) * 0.04
    radius = int(210 * pulse)
    draw.ellipse((640 - radius, 350 - radius, 640 + radius, 350 + radius), fill="#0c413c")
    text(draw, (640, 128), "FEROCITY", 30, MINT, True, "ma")
    text(draw, (640, 222), "MOST SOFTWARE TRACKS THE WORK.", 39, "#ffffff", True, "ma")
    text(draw, (640, 292), "FEROCITY KEEPS IT MOVING.", 47, MINT, True, "ma")
    rounded(draw, (418, 405, 862, 496), 20, "#f4fbf9")
    text(draw, (640, 431), "FEROCITY.LIVE", 34, TEAL, True, "ma")
    text(draw, (640, 545), "SEE THE BUSINESS LOOP WORK", 19, "#b8cecf", True, "ma")
    text(draw, (640, 672), "Created with Ferocity", 15, "#78999a", False, "ma")
    return image


SCENES = [
    (4.5, scene_opportunity),
    (4.5, scene_campaign),
    (4.8, scene_call),
    (4.5, scene_estimate),
    (4.4, scene_schedule),
    (4.2, scene_completion),
    (4.2, scene_money),
    (4.4, scene_compound),
    (4.4, scene_owner),
    (4.2, scene_end),
]


def create_voiceover():
    output = OUT / "ferocity-motion-demo-voiceover-natural.mp3"
    if output.exists() and output.stat().st_size > 1000:
        return output
    narration = (
        "At eight oh two, Ferocity sees open capacity and rising demand. "
        "It prepares the campaign, then publishes through approved channels. "
        "A homeowner calls. Ferocity answers, qualifies the job, builds the estimate, and keeps following up. "
        "The customer accepts. Ferocity schedules the crew and keeps everyone informed. "
        "When the work is finished and photos arrive, Ferocity prepares the invoice, updates labor, materials, and profit, then turns that proof into reviews, ads, and search content. "
        "The next opportunity is already starting. Twelve actions completed. One decision needs you. "
        "Most software tracks work. Ferocity keeps it moving."
    )
    payload = json.dumps({
        "model": "gpt-4o-mini-tts",
        "voice": "marin",
        "input": narration,
        "instructions": "Speak like a warm, thoughtful business owner explaining something remarkable to another owner. Natural conversational cadence, subtle emotion, and varied pacing. Use small pauses between business stages. Never sound like an announcer, a tutorial bot, or a synthetic commercial. Let 'Twelve actions completed. One decision needs you.' breathe, then deliver the final contrast calmly and memorably.",
        "response_format": "mp3",
    }).encode("utf-8")
    request = urllib.request.Request(
        "https://api.openai.com/v1/audio/speech",
        data=payload,
        headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        output.write_bytes(response.read())
    return output


def render_animation():
    silent = OUT / "ferocity-motion-demo-silent.mp4"
    total = sum(duration for duration, _ in SCENES)
    command = [
        str(FFMPEG), "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{WIDTH}x{HEIGHT}",
        "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "17",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(silent)
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    elapsed = 0.0
    total_frames = round(total * FPS)
    for frame_index in range(total_frames):
        now = frame_index / FPS
        scene_start = 0.0
        scene_image = None
        for duration, renderer in SCENES:
            if now < scene_start + duration or renderer is SCENES[-1][1]:
                local = clamp((now - scene_start) / duration)
                scene_image = renderer(local, now / total)
                break
            scene_start += duration
        process.stdin.write(scene_image.tobytes())
    process.stdin.close()
    if process.wait() != 0:
        raise RuntimeError("Motion render failed.")
    return silent, total


def mix_audio(silent, narration, total):
    output = OUT / "ferocity-business-loop-motion-demo.mp4"
    # A subtle synthesized tonal bed gives the motion rhythm without licensing risk.
    filter_complex = (
        "[1:a]loudnorm=I=-16:TP=-1.5:LRA=7[voice];"
        "[2:a]volume=0.018,tremolo=f=0.12:d=0.25[bed1];"
        "[3:a]volume=0.012,tremolo=f=0.11:d=0.2[bed2];"
        "[voice][bed1][bed2]amix=inputs=3:duration=longest:dropout_transition=2:normalize=0[outa]"
    )
    subprocess.run([
        str(FFMPEG), "-y", "-i", str(silent), "-i", str(narration),
        "-f", "lavfi", "-t", str(total), "-i", "sine=frequency=110:sample_rate=48000",
        "-f", "lavfi", "-t", str(total), "-i", "sine=frequency=164.81:sample_rate=48000",
        "-filter_complex", filter_complex, "-map", "0:v", "-map", "[outa]", "-t", str(total),
        "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-b:a", "192k", "-movflags", "+faststart", str(output)
    ], check=True)
    return output


def contact_sheet(video):
    output = OUT / "ferocity-business-loop-motion-demo-contact-sheet.jpg"
    subprocess.run([
        str(FFMPEG), "-y", "-i", str(video), "-vf",
        "fps=1/5.4,scale=400:-1,tile=3x3:padding=8:margin=8:color=0x071720",
        "-frames:v", "1", "-update", "1", str(output)
    ], check=True)
    return output


def main():
    load_env()
    OUT.mkdir(parents=True, exist_ok=True)
    if not FFMPEG.exists():
        raise FileNotFoundError(f"FFmpeg not found: {FFMPEG}")
    narration = create_voiceover()
    silent, total = render_animation()
    output = mix_audio(silent, narration, total)
    sheet = contact_sheet(output)
    print(f"MOTION_DEMO={output}")
    print(f"CONTACT_SHEET={sheet}")


if __name__ == "__main__":
    main()
