import json
import os
import subprocess
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "artifacts" / "launch-video"
PRODUCT = ARTIFACTS / "product"
SOURCE_VIDEO = ARTIFACTS / "ferocity-sora-launch-hook-2026-08-01.mp4"
OUTPUT_VIDEO = ARTIFACTS / "ferocity-launch-ad-final-2026-08-01.mp4"
VOICEOVER = ARTIFACTS / "ferocity-product-proof-voiceover.mp3"
FFMPEG = Path(os.environ["FEROCITY_FFMPEG"])


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
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / name), size)


def fit_crop(image, size):
    target_w, target_h = size
    scale = max(target_w / image.width, target_h / image.height)
    resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def draw_label(draw, xy, text):
    x, y = xy
    label_font = font(24, True)
    box = draw.textbbox((x, y), text, font=label_font)
    draw.rounded_rectangle((box[0] - 16, box[1] - 10, box[2] + 16, box[3] + 10), 12, fill="#c8fff1")
    draw.text((x, y), text, font=label_font, fill="#096c61")


def product_frame(source_path, eyebrow, headline, body, output_name, crop=None):
    source = Image.open(source_path).convert("RGB")
    if crop:
        source = source.crop(crop)
    background = fit_crop(source, (1280, 720)).filter(ImageFilter.GaussianBlur(18))
    background = ImageEnhance.Brightness(background).enhance(0.26)
    canvas = background.copy()
    panel = fit_crop(source, (780, 540))
    canvas.paste(panel, (450, 90))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((32, 62, 430, 658), 28, fill="#0e1728")
    draw_label(draw, (64, 105), eyebrow)
    draw.multiline_text((64, 190), headline, font=font(45, True), fill="#ffffff", spacing=8)
    draw.multiline_text((64, 380), body, font=font(25), fill="#d7e4e3", spacing=10)
    draw.text((64, 600), "FEROCITY · REAL PRODUCT", font=font(18, True), fill="#67ddc7")
    canvas.save(PRODUCT / output_name, quality=95)


def end_card():
    canvas = Image.new("RGB", (1280, 720), "#081a1b")
    draw = ImageDraw.Draw(canvas)
    for radius, color in [(480, "#0d3936"), (330, "#0e4b45"), (180, "#126359")]:
        draw.ellipse((640 - radius, 360 - radius, 640 + radius, 360 + radius), fill=color)
    draw.rounded_rectangle((165, 105, 1115, 615), 42, fill="#f6fbfa")
    draw.text((640, 160), "FEROCITY", font=font(36, True), fill="#0d7569", anchor="ma")
    draw.multiline_text(
        (640, 245),
        "The AI operating system\nthat keeps work moving.",
        font=font(52, True),
        fill="#111c2d",
        anchor="ma",
        align="center",
        spacing=8,
    )
    draw.rounded_rectangle((425, 425, 855, 505), 18, fill="#0d7569")
    draw.text((640, 446), "FEROCITY.LIVE", font=font(34, True), fill="#ffffff", anchor="ma")
    draw.text((640, 540), "SEE FEROCITY WORK", font=font(22, True), fill="#263849", anchor="ma")
    draw.text((640, 650), "Created with Ferocity", font=font(18), fill="#9fc9c2", anchor="ma")
    canvas.save(PRODUCT / "end-card.png", quality=95)


def create_voiceover():
    text = (
        "One shared Business Brain watches what changes, decides what should happen next, "
        "coordinates people and AI employees, and advances authorized work across the company. "
        "See Ferocity work."
    )
    payload = json.dumps({
        "model": "gpt-4o-mini-tts",
        "voice": "cedar",
        "input": text,
        "instructions": "Warm, calm, grounded commercial narrator. Confident but never hyped. Natural pace with a clear, memorable final URL.",
        "response_format": "mp3",
    }).encode("utf-8")
    request = urllib.request.Request(
        "https://api.openai.com/v1/audio/speech",
        data=payload,
        headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        VOICEOVER.write_bytes(response.read())


def compose():
    frames = [
        PRODUCT / "proof-noticed.png",
        PRODUCT / "proof-loop.png",
        PRODUCT / "proof-workforce.png",
        PRODUCT / "end-card.png",
    ]
    command = [str(FFMPEG), "-y", "-i", str(SOURCE_VIDEO)]
    for frame in frames:
        command += ["-loop", "1", "-framerate", "30", "-t", "3.5", "-i", str(frame)]
    command += ["-i", str(VOICEOVER)]
    video_filters = ["[0:v]trim=duration=12,setpts=PTS-STARTPTS,scale=1280:720,fps=30,format=yuv420p,setsar=1[v0]"]
    for index in range(1, 5):
        video_filters.append(
            f"[{index}:v]trim=duration=3.5,setpts=PTS-STARTPTS,scale=1280:720,fps=30,format=yuv420p,setsar=1[v{index}]"
        )
    video_filters += [
        "[v0][v1][v2][v3][v4]concat=n=5:v=1:a=0[outv]",
        "[0:a]atrim=0:12,asetpts=PTS-STARTPTS,afade=t=out:st=11.5:d=0.5[a0]",
        "[5:a]adelay=12000|12000,volume=1.05[a1]",
        "[a0][a1]amix=inputs=2:duration=longest:dropout_transition=0,apad=pad_dur=3[outa]",
    ]
    command += [
        "-filter_complex", ";".join(video_filters),
        "-map", "[outv]", "-map", "[outa]",
        "-t", "26", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(OUTPUT_VIDEO),
    ]
    subprocess.run(command, check=True)


load_env()
PRODUCT.mkdir(parents=True, exist_ok=True)
product_frame(
    PRODUCT / "home-command-center.png",
    "FEROCITY NOTICED",
    "$28k in estimates\nis losing momentum.",
    "Follow-up ready.\nThe response stays watched.",
    "proof-noticed.png",
    crop=(560, 110, 1260, 680),
)
product_frame(
    PRODUCT / "demo-flow.png",
    "THE OPERATING LOOP",
    "Every result starts\nthe next decision.",
    "Notice · Understand\nCoordinate · Act · Continue",
    "proof-loop.png",
)
product_frame(
    PRODUCT / "demo-tour.png",
    "ONE BUSINESS BRAIN",
    "People and AI\nemployees share\nthe thread.",
    "The right work reaches\nthe right worker.",
    "proof-workforce.png",
)
end_card()
create_voiceover()
compose()
print(f"FINAL_AD={OUTPUT_VIDEO}")
