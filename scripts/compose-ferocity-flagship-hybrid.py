import os
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "artifacts" / "launch-video"
OUT = ARTIFACTS / "flagship-hybrid"
AI_FOOTAGE = ARTIFACTS / "ferocity-sora-launch-hook-2026-08-01.mp4"
PRODUCT_STORY = ARTIFACTS / "motion-demo" / "ferocity-business-loop-motion-demo.mp4"
SHORT_STORY = ARTIFACTS / "business-loop-campaign" / "ferocity-business-loop-15s.mp4"
BUMPER_STORY = ARTIFACTS / "business-loop-campaign" / "ferocity-business-loop-06s.mp4"
FFMPEG = Path(
    os.environ.get(
        "FEROCITY_FFMPEG",
        r"C:\Users\schem\AppData\Local\Temp\ferocity-video-tools-v2\node_modules\ffmpeg-static\ffmpeg.exe",
    )
)


def font(size: int, bold: bool = False):
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / name), size)


def opening_overlay(path: Path):
    image = Image.new("RGBA", (1280, 720), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1280, 720), fill=(4, 14, 20, 74))
    draw.rounded_rectangle((46, 425, 1030, 660), 28, fill=(6, 20, 28, 218))
    draw.text((78, 455), "YOUR BUSINESS CAN'T GROW", font=font(24, True), fill="#65e3c5")
    draw.text((78, 500), "if every next step waits for you.", font=font(47, True), fill="#ffffff")
    draw.text((78, 582), "What if the whole company could keep moving?", font=font(27), fill="#dbe9e8")
    draw.text((1208, 54), "FEROCITY", font=font(23, True), fill="#ffffff", anchor="ra")
    image.save(path)


def attribution_overlay(path: Path):
    image = Image.new("RGBA", (1280, 720), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((170, 627, 1110, 688), 18, fill=(4, 19, 24, 220))
    draw.text(
        (640, 644),
        "CAMPAIGN CREATED WITH FEROCITY'S MARKETING FEATURES",
        font=font(16, True),
        fill="#ffffff",
        anchor="ma",
    )
    draw.text(
        (640, 668),
        "AI footage rendered through a connected provider",
        font=font(14),
        fill="#9fd9cf",
        anchor="ma",
    )
    image.save(path)


def render(output: Path, opener: Path, attribution: Path):
    # Keep the original 44-second narrated product story intact. Replace three
    # matching visual passages with cinematic AI footage so the result feels
    # human first and product-proven second without paying to regenerate video.
    filters = [
        "[0:v]split=4[ai_open][ai_call][ai_field][ai_relief]",
        "[1:v]split=4[m0][m1][m2][m3]",
        "[ai_open]trim=start=0:end=4.2,setpts=PTS-STARTPTS,scale=1280:720,fps=30,format=yuv420p[open_base]",
        "[open_base][2:v]overlay=0:0:shortest=1,fade=t=in:st=0:d=0.35,fade=t=out:st=3.85:d=0.35[vopen]",
        "[m0]trim=start=0:end=9,setpts=PTS-STARTPTS,scale=1280:720,fps=30,format=yuv420p[vm0]",
        "[ai_call]trim=start=0:end=4.8,setpts=PTS-STARTPTS,scale=1280:720,fps=30,format=yuv420p[vcall]",
        "[m1]trim=start=13.8:end=18.3,setpts=PTS-STARTPTS,scale=1280:720,fps=30,format=yuv420p[vm1]",
        "[ai_field]trim=start=4.5:end=8.9,setpts=PTS-STARTPTS,scale=1280:720,fps=30,format=yuv420p[vfield]",
        "[m2]trim=start=22.7:end=35.6,setpts=PTS-STARTPTS,scale=1280:720,fps=30,format=yuv420p[vm2]",
        "[ai_relief]trim=start=7.6:end=12,setpts=PTS-STARTPTS,scale=1280:720,fps=30,format=yuv420p[vrelief]",
        "[m3]trim=start=40:end=44.1,setpts=PTS-STARTPTS,scale=1280:720,fps=30,format=yuv420p[vm3]",
        "[vm3][3:v]overlay=0:0:shortest=1[vend]",
        "[vopen][vm0][vcall][vm1][vfield][vm2][vrelief][vend]concat=n=8:v=1:a=0[outv]",
        "[0:a]atrim=start=0:end=4.2,asetpts=PTS-STARTPTS,volume=0.22,afade=t=out:st=3.6:d=0.6[aopen]",
        "[1:a]atrim=start=0:end=44.1,asetpts=PTS-STARTPTS,loudnorm=I=-16:TP=-1.5:LRA=7[astory]",
        "[aopen][astory]concat=n=2:v=0:a=1[outa]",
    ]
    subprocess.run(
        [
            str(FFMPEG),
            "-y",
            "-i",
            str(AI_FOOTAGE),
            "-i",
            str(PRODUCT_STORY),
            "-loop",
            "1",
            "-i",
            str(opener),
            "-loop",
            "1",
            "-i",
            str(attribution),
            "-filter_complex",
            ";".join(filters),
            "-map",
            "[outv]",
            "-map",
            "[outa]",
            "-t",
            "48.3",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "17",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            str(output),
        ],
        check=True,
    )


def contact_sheet(video: Path, output: Path):
    subprocess.run(
        [
            str(FFMPEG),
            "-y",
            "-i",
            str(video),
            "-vf",
            "fps=1/5.35,scale=400:-1,tile=3x3:padding=8:margin=8:color=0x071720",
            "-frames:v",
            "1",
            "-update",
            "1",
            str(output),
        ],
        check=True,
    )


def render_short(source: Path, output: Path, opener: Path, attribution: Path, duration: float, opening_seconds: float):
    ending_seconds = 3.0
    middle_end = duration - ending_seconds
    filters = [
        f"[0:v]trim=start=0:end={opening_seconds},setpts=PTS-STARTPTS,scale=1280:720,fps=30,format=yuv420p[ai]",
        "[ai][2:v]overlay=0:0:shortest=1[vopen]",
        "[1:v]split=2[mid][end]",
        f"[mid]trim=start={opening_seconds}:end={middle_end},setpts=PTS-STARTPTS,scale=1280:720,fps=30,format=yuv420p[vmid]",
        f"[end]trim=start={middle_end}:end={duration},setpts=PTS-STARTPTS,scale=1280:720,fps=30,format=yuv420p[vend_base]",
        "[vend_base][3:v]overlay=0:0:shortest=1[vend]",
        "[vopen][vmid][vend]concat=n=3:v=1:a=0[outv]",
        f"[1:a]atrim=start=0:end={duration},asetpts=PTS-STARTPTS,loudnorm=I=-16:TP=-1.5:LRA=7[outa]",
    ]
    subprocess.run(
        [
            str(FFMPEG), "-y", "-i", str(AI_FOOTAGE), "-i", str(source),
            "-loop", "1", "-i", str(opener), "-loop", "1", "-i", str(attribution),
            "-filter_complex", ";".join(filters), "-map", "[outv]", "-map", "[outa]",
            "-t", str(duration), "-c:v", "libx264", "-preset", "medium", "-crf", "17",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(output),
        ],
        check=True,
    )


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    if not FFMPEG.exists():
        raise FileNotFoundError(f"FFmpeg not found: {FFMPEG}")
    opener = OUT / "opening-overlay.png"
    attribution = OUT / "attribution-overlay.png"
    output = OUT / "ferocity-flagship-hybrid.mp4"
    short = OUT / "ferocity-flagship-hybrid-15s.mp4"
    bumper = OUT / "ferocity-flagship-hybrid-06s.mp4"
    sheet = OUT / "ferocity-flagship-hybrid-contact-sheet.jpg"
    opening_overlay(opener)
    attribution_overlay(attribution)
    render(output, opener, attribution)
    render_short(SHORT_STORY, short, opener, attribution, 15.0, 3.0)
    render_short(BUMPER_STORY, bumper, opener, attribution, 6.0, 2.0)
    contact_sheet(output, sheet)
    print(f"FLAGSHIP_VIDEO={output}")
    print(f"SHORT_VIDEO={short}")
    print(f"BUMPER_VIDEO={bumper}")
    print(f"CONTACT_SHEET={sheet}")


if __name__ == "__main__":
    main()
