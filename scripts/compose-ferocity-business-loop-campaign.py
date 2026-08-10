import json
import os
import subprocess
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "artifacts" / "launch-video"
PRODUCT = ARTIFACTS / "product"
CAMPAIGN = ARTIFACTS / "business-loop-campaign"
SOURCE_VIDEO = ARTIFACTS / "ferocity-sora-launch-hook-2026-08-01.mp4"
FFMPEG = Path(os.environ.get("FEROCITY_FFMPEG", r"C:\Users\schem\AppData\Local\Temp\ferocity-video-tools\node_modules\ffmpeg-static\ffmpeg.exe"))


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
    file_name = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / file_name), size)


def fit_crop(image, size):
    target_w, target_h = size
    scale = max(target_w / image.width, target_h / image.height)
    resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def wrap(draw, text, text_font, max_width):
    lines = []
    current = ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if current and draw.textbbox((0, 0), candidate, font=text_font)[2] > max_width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return "\n".join(lines)


def story_frame(source_name, eyebrow, headline, detail, step, output_name, accent="#5fe0c2"):
    source = Image.open(PRODUCT / source_name).convert("RGB")
    background = fit_crop(source, (1280, 720)).filter(ImageFilter.GaussianBlur(22))
    background = ImageEnhance.Brightness(background).enhance(0.22)
    canvas = background.copy()
    screenshot = fit_crop(source, (730, 545))
    screenshot = ImageEnhance.Contrast(screenshot).enhance(1.05)
    canvas.paste(screenshot, (500, 86))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((36, 52, 520, 668), 30, fill="#091522", outline="#284657", width=2)
    draw.rounded_rectangle((66, 82, 150, 132), 15, fill=accent)
    draw.text((108, 94), str(step), font=font(22, True), fill="#09201d", anchor="ma")
    draw.text((170, 92), eyebrow.upper(), font=font(20, True), fill=accent)
    headline_text = wrap(draw, headline, font(42, True), 395)
    draw.multiline_text((66, 180), headline_text, font=font(42, True), fill="#ffffff", spacing=8)
    detail_text = wrap(draw, detail, font(24), 385)
    draw.multiline_text((66, 390), detail_text, font=font(24), fill="#d2e1e7", spacing=9)
    draw.text((66, 614), "FEROCITY.LIVE", font=font(20, True), fill=accent)
    canvas.save(CAMPAIGN / output_name, quality=96)


def loop_frame(output_name):
    canvas = Image.new("RGB", (1280, 720), "#07151c")
    draw = ImageDraw.Draw(canvas)
    draw.text((640, 70), "ONE RESULT CREATES THE NEXT OPPORTUNITY", font=font(34, True), fill="#ffffff", anchor="ma")
    labels = ["MARKET", "LEAD", "WIN", "SCHEDULE", "COMPLETE", "GET PAID", "PROVE", "GROW"]
    centers = [(195, 240), (420, 180), (650, 180), (875, 240), (875, 475), (650, 535), (420, 535), (195, 475)]
    for index, (label, (x, y)) in enumerate(zip(labels, centers)):
        next_x, next_y = centers[(index + 1) % len(centers)]
        draw.line((x, y, next_x, next_y), fill="#3e8077", width=7)
        draw.ellipse((x - 76, y - 38, x + 76, y + 38), fill="#eafbf6", outline="#5fe0c2", width=3)
        draw.text((x, y - 12), label, font=font(18, True), fill="#0c554d", anchor="ma")
    draw.rounded_rectangle((470, 280, 810, 440), 28, fill="#0f2d34", outline="#5fe0c2", width=3)
    draw.text((640, 320), "FEROCITY", font=font(27, True), fill="#5fe0c2", anchor="ma")
    draw.multiline_text((640, 365), "watches what changes\nand advances what comes next", font=font(24, True), fill="#ffffff", anchor="ma", align="center", spacing=6)
    draw.text((640, 650), "MOST SOFTWARE TRACKS THE WORK. FEROCITY KEEPS IT MOVING.", font=font(22, True), fill="#a8c9c7", anchor="ma")
    canvas.save(CAMPAIGN / output_name, quality=96)


def end_card(output_name, headline="MOST SOFTWARE TRACKS THE WORK.", subhead="FEROCITY KEEPS IT MOVING."):
    canvas = Image.new("RGB", (1280, 720), "#07171a")
    draw = ImageDraw.Draw(canvas)
    for radius, color in [(520, "#0a2b2b"), (360, "#0d403b"), (210, "#10594f")]:
        draw.ellipse((640 - radius, 360 - radius, 640 + radius, 360 + radius), fill=color)
    draw.rounded_rectangle((145, 105, 1135, 615), 44, fill="#f6fbfa")
    draw.text((640, 155), "FEROCITY", font=font(34, True), fill="#0c7569", anchor="ma")
    draw.text((640, 245), headline, font=font(39, True), fill="#101d2a", anchor="ma")
    draw.text((640, 310), subhead, font=font(44, True), fill="#0c7569", anchor="ma")
    draw.rounded_rectangle((415, 410, 865, 495), 18, fill="#0c7569")
    draw.text((640, 432), "FEROCITY.LIVE", font=font(34, True), fill="#ffffff", anchor="ma")
    draw.text((640, 545), "SEE THE BUSINESS LOOP WORK", font=font(20, True), fill="#273947", anchor="ma")
    draw.text((640, 655), "Created with Ferocity", font=font(17), fill="#9cc3be", anchor="ma")
    canvas.save(CAMPAIGN / output_name, quality=96)


def create_voiceover(name, text, pace="Natural commercial pace. Confident, specific, and grounded. Do not sound overhyped."):
    output = CAMPAIGN / name
    if output.exists() and output.stat().st_size > 1000:
        return output
    payload = json.dumps({
        "model": "gpt-4o-mini-tts",
        "voice": "cedar",
        "input": text,
        "instructions": pace,
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


def compose_stills(output_name, voiceover, frames, frame_seconds, source_seconds=0, audio_speed=1.0):
    output = CAMPAIGN / output_name
    command = [str(FFMPEG), "-y"]
    video_inputs = []
    if source_seconds:
        command += ["-i", str(SOURCE_VIDEO)]
        video_inputs.append((0, source_seconds, "source"))
    for frame in frames:
        command += ["-loop", "1", "-framerate", "30", "-t", str(frame_seconds), "-i", str(CAMPAIGN / frame)]
        video_inputs.append((len(video_inputs), frame_seconds, "still"))
    voice_index = len(video_inputs)
    command += ["-i", str(voiceover)]
    filters = []
    labels = []
    for index, (_, seconds, kind) in enumerate(video_inputs):
        if kind == "source":
            filters.append(f"[{index}:v]trim=duration={seconds},setpts=PTS-STARTPTS,scale=1280:720,fps=30,format=yuv420p,setsar=1[v{index}]")
        else:
            filters.append(f"[{index}:v]trim=duration={seconds},setpts=PTS-STARTPTS,scale=1280:720,fps=30,format=yuv420p,setsar=1[v{index}]")
        labels.append(f"[v{index}]")
    filters.append(f"{''.join(labels)}concat=n={len(labels)}:v=1:a=0[outv]")
    speed_filter = f"atempo={audio_speed}," if audio_speed != 1.0 else ""
    filters.append(f"[{voice_index}:a]{speed_filter}loudnorm=I=-16:TP=-1.5:LRA=7,apad=pad_dur=2[outa]")
    total = source_seconds + len(frames) * frame_seconds
    command += [
        "-filter_complex", ";".join(filters), "-map", "[outv]", "-map", "[outa]", "-t", str(total),
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(output)
    ]
    subprocess.run(command, check=True)
    return output


def contact_sheet(video, output, interval, columns, rows):
    subprocess.run([
        str(FFMPEG), "-y", "-i", str(video), "-vf",
        f"fps=1/{interval},scale=400:-1,tile={columns}x{rows}:padding=8:margin=8:color=0x07151c",
        "-frames:v", "1", str(output)
    ], check=True)


def main():
    load_env()
    CAMPAIGN.mkdir(parents=True, exist_ok=True)
    if not FFMPEG.exists():
        raise FileNotFoundError(f"FFmpeg not found: {FFMPEG}")

    story_frame("demo-tour.png", "Ferocity notices", "There is demand the business is positioned to win.", "Capacity, season, service area, past customers, and approved proof point to the next growth move.", 1, "01-opportunity.png")
    story_frame("acme-dashboard.png", "Ferocity creates", "The campaign starts feeding the business loop.", "Ads, search content, landing pages, and customer reactivation are prepared and published only through approved connected channels.", 2, "02-campaign.png")
    story_frame("demo-top.png", "Ferocity answers", "A prospect responds. The business is already ready.", "Phone, chat, text, email, and forms become one remembered conversation with qualification and the next action prepared.", 3, "03-lead.png")
    story_frame("demo-flow.png", "Ferocity advances", "The estimate does not become another forgotten task.", "The opportunity, pricing context, follow-up, and approved next step continue moving without losing the customer thread.", 4, "04-estimate.png")
    story_frame("demo-tour.png", "Ferocity coordinates", "The crew, customer, schedule, and job plan move together.", "Assignments, timing, materials, reminders, and changes stay connected to the same business context.", 5, "05-schedule.png")
    story_frame("demo-flow.png", "Ferocity watches", "Completion evidence starts the money loop.", "The employee marks the job complete and uploads approved photos, time, forms, and field proof.", 6, "06-complete.png")
    story_frame("home-command-center.png", "Ferocity reconciles", "Payment, labor cost, and profitability become visible.", "Connected payment status, approved hours, materials, job cost, follow-up, and reporting update without inventing payroll execution.", 7, "07-profit.png")
    story_frame("acme-dashboard.png", "Ferocity compounds", "The completed job becomes proof for the next campaign.", "Reviews, referrals, approved photos, content, SEO, GEO, and campaign learning feed the next opportunity.", 8, "08-growth.png")
    loop_frame("09-loop.png")
    end_card("10-end.png")
    end_card("15-end.png", "YOUR CRM CREATED TASKS.", "FEROCITY COMPLETED THE WORK.")
    end_card("06-end.png", "MOST SOFTWARE TRACKS WORK.", "FEROCITY KEEPS IT MOVING.")

    flagship_text = (
        "Ferocity notices an opportunity: demand is rising, the schedule has room, and approved project proof is ready. "
        "It builds the campaign, improves the search content, and publishes through connected channels within the owner's rules. "
        "A customer responds. Ferocity answers, qualifies the job, prepares the estimate, and keeps the opportunity moving. "
        "Once approved, it schedules the crew, updates the customer, and watches materials, time, and job progress. "
        "When the employee finishes and uploads photos, Ferocity prepares the invoice, records connected payment status, reconciles labor and job costs, updates profitability, requests the review, and turns the result into the next campaign. "
        "Then the loop starts again. Most software tracks the work. Ferocity keeps it moving."
    )
    short_text = (
        "Ferocity finds the opportunity, launches the approved campaign, answers the lead, prepares the estimate, schedules the crew, "
        "follows the job through payment, and turns the result into the next campaign. Your CRM created tasks. Ferocity completed the work."
    )
    bumper_text = "Most software tracks the work. Ferocity keeps it moving. See it at Ferocity dot live."
    flagship_audio = create_voiceover("flagship-loop-voiceover.mp3", flagship_text)
    short_audio = create_voiceover("15-second-voiceover.mp3", short_text, "Energetic but credible fifteen-second commercial read. Crisp pace, clear contrast at the end.")
    bumper_audio = create_voiceover("06-second-voiceover.mp3", bumper_text, "Fast, memorable six-second commercial tag. Clearly emphasize Ferocity and the URL.")

    flagship = compose_stills(
        "ferocity-business-loop-flagship.mp4", flagship_audio,
        ["01-opportunity.png", "02-campaign.png", "03-lead.png", "04-estimate.png", "05-schedule.png", "06-complete.png", "07-profit.png", "08-growth.png", "09-loop.png", "10-end.png"],
        4.5,
    )
    short = compose_stills(
        "ferocity-business-loop-15s.mp4", short_audio,
        ["02-campaign.png", "03-lead.png", "04-estimate.png", "05-schedule.png", "06-complete.png", "07-profit.png", "08-growth.png", "15-end.png"],
        1.875,
        audio_speed=1.04,
    )
    bumper = compose_stills("ferocity-business-loop-06s.mp4", bumper_audio, ["09-loop.png", "06-end.png"], 3.0)
    contact_sheet(flagship, CAMPAIGN / "flagship-contact-sheet.jpg", 6, 3, 3)
    contact_sheet(short, CAMPAIGN / "15s-contact-sheet.jpg", 2, 3, 3)
    contact_sheet(bumper, CAMPAIGN / "06s-contact-sheet.jpg", 2, 2, 2)
    print(f"FLAGSHIP={flagship}")
    print(f"SHORT={short}")
    print(f"BUMPER={bumper}")


if __name__ == "__main__":
    main()
