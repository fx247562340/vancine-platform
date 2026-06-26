#!/usr/bin/env python3
from __future__ import annotations

import math
import os
import subprocess
import textwrap
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "videos" / "day1"
AVATAR = ROOT / "output" / "imagegen" / "vancine-youtube-avatar-800x800.png"

W, H = 1080, 1920
FPS = 24

FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BLACK = "/System/Library/Fonts/Supplemental/Arial Black.ttf"


VIDEOS = [
    {
        "slug": "01-never-tested-chinese-ai-models",
        "voiceover": (
            "Most developers outside China have never tested the latest Chinese AI models. "
            "But some of them are already strong for writing, translation, coding, image, video, and music generation. "
            "The hard part is not always quality. The hard part is access. "
            "Vancine gives global developers one API to test top Chinese AI models. "
            "Start testing at vancine dot com."
        ),
        "scenes": [
            (4.2, "Most developers have never tested Chinese AI models", "A huge access gap is hiding in plain sight."),
            (5.0, "The models are moving fast", "Writing, translation, coding, image, video, music, and multimodal generation."),
            (5.0, "Quality is not the only problem", "For global developers, access and integration are often the real blockers."),
            (5.0, "Vancine gives you one API", "Test top Chinese AI models from one unified developer endpoint."),
            (4.2, "Start testing today", "vancine.com"),
        ],
    },
    {
        "slug": "02-one-api-for-chinese-ai-models",
        "voiceover": (
            "Want to test Chinese AI models without managing multiple integrations? "
            "Vancine gives developers one API for top Chinese AI models. "
            "You can explore text, image, video, music, and multimodal generation from one place. "
            "For global builders, this makes testing Chinese AI models much easier. "
            "Try Vancine at vancine dot com."
        ),
        "scenes": [
            (4.0, "One API for Chinese AI models", "Built for global developers who want easier access."),
            (4.6, "One endpoint", "Multiple model categories, one integration path."),
            (5.2, "Text. Image. Video. Music.", "Explore Chinese AI capabilities from one place."),
            (5.2, "Developer-first access", "Reduce integration friction and test faster."),
            (4.0, "Try Vancine", "vancine.com"),
        ],
    },
    {
        "slug": "03-chinese-ai-moving-fast",
        "voiceover": (
            "Chinese AI models are getting better fast. "
            "New models are launching across text, image, video, music, and multimodal generation. "
            "But many global developers still do not know how to access them. "
            "Vancine is building a unified API for top Chinese AI models. "
            "If you are building AI products, it is worth testing these models. "
            "Start at vancine dot com."
        ),
        "scenes": [
            (4.0, "Chinese AI models are moving fast", "New capabilities are launching every month."),
            (5.0, "Text, image, video, music", "The ecosystem is broader than many builders realize."),
            (5.0, "Global access is still hard", "Different platforms, docs, payments, and integrations slow teams down."),
            (5.2, "Vancine makes testing easier", "A unified API for top Chinese AI models."),
            (4.2, "Build with more model choices", "Start at vancine.com"),
        ],
    },
]


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size=size)


def wrap(draw: ImageDraw.ImageDraw, text: str, ft: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = (current + " " + word).strip()
        if draw.textbbox((0, 0), candidate, font=ft)[2] <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def rounded_rect(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


@lru_cache(maxsize=16)
def gradient_background_cached(step: int) -> Image.Image:
    small_w, small_h = 270, 480
    img = Image.new("RGB", (small_w, small_h))
    pix = img.load()
    t = step / 15
    phase = math.sin(t * math.pi * 2) * 0.18
    c1 = (173, 144, 255)
    c2 = (57, 212, 207)
    c3 = (255, 82, 180)
    for y in range(small_h):
        for x in range(small_w):
            nx = x / (small_w - 1)
            ny = y / (small_h - 1)
            a = max(0.0, min(1.0, nx * 0.72 + ny * 0.28 + phase))
            b = max(0.0, min(1.0, (1 - ny) * 0.35 + math.sin((nx + t) * math.pi) * 0.2))
            r = int(c1[0] * (1 - a) + c2[0] * a)
            g = int(c1[1] * (1 - a) + c2[1] * a)
            bl = int(c1[2] * (1 - a) + c2[2] * a)
            r = int(r * (1 - b) + c3[0] * b)
            g = int(g * (1 - b) + c3[1] * b)
            bl = int(bl * (1 - b) + c3[2] * b)
            pix[x, y] = (r, g, bl)
    return img.resize((W, H), Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(0.4))


def gradient_background(t: float) -> Image.Image:
    return gradient_background_cached(int(t * 15) % 16).copy()


def load_logo(size: int) -> Image.Image:
    logo = Image.open(AVATAR).convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse((0, 0, size - 1, size - 1), fill=255)
    logo.putalpha(mask)
    return logo


def draw_text_block(draw: ImageDraw.ImageDraw, title: str, subtitle: str, scene_i: int, progress: float):
    title_font = font(FONT_BLACK, 72 if len(title) > 34 else 84)
    body_font = font(FONT_BOLD, 38)
    small_font = font(FONT_BOLD, 30)

    card_x0, card_y0 = 80, 520
    card_x1, card_y1 = W - 80, 1230
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    rounded_rect(sd, (card_x0 + 8, card_y0 + 14, card_x1 + 8, card_y1 + 14), 46, (69, 39, 118, 70))
    return_shadow = shadow.filter(ImageFilter.GaussianBlur(24))
    return_shadow.alpha_composite(shadow)

    rounded_rect(draw, (card_x0, card_y0, card_x1, card_y1), 46, (255, 255, 255, 205), (255, 255, 255, 210), 2)

    tag = f"DAY 1 TEST 0{scene_i + 1}"
    rounded_rect(draw, (card_x0 + 44, card_y0 + 44, card_x0 + 286, card_y0 + 96), 26, (28, 32, 48, 230))
    draw.text((card_x0 + 68, card_y0 + 57), tag, fill=(255, 255, 255), font=small_font)

    title_lines = wrap(draw, title, title_font, card_x1 - card_x0 - 88)
    y = card_y0 + 142
    for line in title_lines[:4]:
        bbox = draw.textbbox((0, 0), line, font=title_font)
        draw.text(((W - (bbox[2] - bbox[0])) / 2, y), line, fill=(25, 27, 36), font=title_font)
        y += 92

    body_lines = wrap(draw, subtitle, body_font, card_x1 - card_x0 - 120)
    y += 28
    for line in body_lines[:5]:
        bbox = draw.textbbox((0, 0), line, font=body_font)
        draw.text(((W - (bbox[2] - bbox[0])) / 2, y), line, fill=(55, 67, 89), font=body_font)
        y += 54

    # Progress bar.
    bar_x0, bar_y0, bar_x1, bar_y1 = card_x0 + 60, card_y1 - 82, card_x1 - 60, card_y1 - 54
    rounded_rect(draw, (bar_x0, bar_y0, bar_x1, bar_y1), 14, (220, 225, 238, 255))
    rounded_rect(draw, (bar_x0, bar_y0, int(bar_x0 + (bar_x1 - bar_x0) * progress), bar_y1), 14, (117, 103, 255, 255))


def draw_decor(draw: ImageDraw.ImageDraw, frame_i: int, total_frames: int):
    t = frame_i / max(total_frames, 1)
    # Soft network nodes, deterministic.
    for i in range(28):
        x = int((math.sin(i * 12.989 + 4.2) * 0.5 + 0.5) * W)
        y = int((math.sin(i * 7.233 + 1.7) * 0.5 + 0.5) * H)
        r = 2 + (i % 4)
        alpha = int(80 + 90 * abs(math.sin(t * math.pi * 2 + i)))
        fill = (255, 255, 255, alpha)
        draw.ellipse((x - r, y - r, x + r, y + r), fill=fill)
        if i % 3 == 0:
            x2 = int((math.sin((i + 3) * 12.989 + 4.2) * 0.5 + 0.5) * W)
            y2 = int((math.sin((i + 3) * 7.233 + 1.7) * 0.5 + 0.5) * H)
            draw.line((x, y, x2, y2), fill=(255, 255, 255, 45), width=2)


def render_video(video: dict):
    slug_dir = OUT / video["slug"]
    frames_dir = slug_dir / f"frames_run_{os.getpid()}"
    frames_dir.mkdir(parents=True, exist_ok=True)

    logo_large = load_logo(250)
    logo_small = load_logo(86)
    brand_font = font(FONT_BLACK, 54)
    url_font = font(FONT_BOLD, 34)

    total_duration = sum(scene[0] for scene in video["scenes"])
    total_frames = int(total_duration * FPS)

    scene_boundaries: list[tuple[int, int, str, str]] = []
    cursor = 0
    for duration, title, subtitle in video["scenes"]:
        scene_frames = int(duration * FPS)
        scene_boundaries.append((cursor, cursor + scene_frames, title, subtitle))
        cursor += scene_frames

    for frame_i in range(total_frames):
        global_t = frame_i / total_frames
        img = gradient_background(global_t)
        overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        od = ImageDraw.Draw(overlay)
        draw_decor(od, frame_i, total_frames)

        # Header brand.
        pulse = 1 + 0.025 * math.sin(global_t * math.pi * 8)
        header_logo = logo_small.resize((int(86 * pulse), int(86 * pulse)), Image.Resampling.LANCZOS)
        overlay.alpha_composite(header_logo, (80, 96))
        od.text((184, 108), "Vancine", fill=(25, 27, 36, 238), font=brand_font)
        od.text((80, 1710), "One API for top Chinese AI models", fill=(255, 255, 255, 235), font=url_font)
        od.text((80, 1760), "vancine.com", fill=(25, 27, 36, 245), font=font(FONT_BLACK, 56))

        # Logo glow.
        glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.ellipse((W - 390, 128, W - 110, 408), fill=(255, 255, 255, 80))
        glow = glow.filter(ImageFilter.GaussianBlur(32))
        overlay.alpha_composite(glow)
        overlay.alpha_composite(logo_large, (W - 370, 140))

        scene_i = 0
        scene_progress = 0.0
        title = subtitle = ""
        for idx, (start, end, s_title, s_subtitle) in enumerate(scene_boundaries):
            if start <= frame_i < end:
                scene_i = idx
                scene_progress = (frame_i - start) / max(end - start, 1)
                title, subtitle = s_title, s_subtitle
                break

        # Scene entrance fade and tiny lift.
        alpha = int(255 * min(1, scene_progress / 0.18))
        scene_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        sd = ImageDraw.Draw(scene_layer)
        draw_text_block(sd, title, subtitle, scene_i, (scene_i + scene_progress) / len(video["scenes"]))
        if alpha < 255:
            scene_layer.putalpha(alpha)
        overlay.alpha_composite(scene_layer)

        combined = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
        combined.save(frames_dir / f"frame_{frame_i:05d}.jpg", quality=92, optimize=True)

    audio_path = slug_dir / "voiceover.aiff"
    subprocess.run(["say", "-v", "Samantha", "-r", "178", "-o", str(audio_path), video["voiceover"]], check=True)

    raw_video = slug_dir / "video_no_audio.mp4"
    final_video = OUT / f"{video['slug']}.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-framerate",
            str(FPS),
            "-i",
            str(frames_dir / "frame_%05d.jpg"),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "24",
            "-pix_fmt",
            "yuv420p",
            "-r",
            str(FPS),
            "-movflags",
            "+faststart",
            str(raw_video),
        ],
        check=True,
    )
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(raw_video),
            "-i",
            str(audio_path),
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-shortest",
            str(final_video),
        ],
        check=True,
    )
    return final_video


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    made = [render_video(video) for video in VIDEOS]
    for path in made:
        print(path)


if __name__ == "__main__":
    main()
