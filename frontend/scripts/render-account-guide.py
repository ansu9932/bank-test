#!/usr/bin/env python3
"""Render the source-based tutorial; --stills previews layouts without encoding."""
import argparse
import json
import math
from pathlib import Path
import subprocess
import tempfile
import urllib.request
import wave

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public' / 'videos'
WORK = Path(tempfile.gettempdir()) / 'alister-video-render'
DATA = json.loads((ROOT / 'src/content/account-guide.json').read_text())
SCENES = DATA['scenes']
W, H, FPS = 1920, 1080, 24
RED, INK, MUTED, WHITE, PAPER = '#C8102E', '#191C22', '#686E78', '#FFFFFF', '#F2F3F5'
TOTAL = sum(scene['duration'] for scene in SCENES)
FONTS = {}
FONT_URLS = {
    'body': 'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf',
    'heading': 'https://raw.githubusercontent.com/google/fonts/main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf',
}


def font(size, weight=400, family='body'):
    key = (size, weight, family)
    if key not in FONTS:
        f = ImageFont.truetype(str(WORK / f'{family}.ttf'), size)
        axes = [weight if axis['name'] == b'Weight' else axis['default'] for axis in f.get_variation_axes()]
        f.set_variation_by_axes(axes)
        FONTS[key] = f
    return FONTS[key]


def text(draw, xy, value, size=26, color=INK, weight=400, family='body'):
    draw.text(xy, str(value), font=font(size, weight, family), fill=color, anchor='lt')


def lines_for(draw, value, size, width, weight=400, family='body'):
    lines = []
    for paragraph in value.split('\n'):
        line = ''
        for word in paragraph.split():
            trial = f'{line} {word}'.strip()
            if draw.textlength(trial, font=font(size, weight, family)) > width and line:
                lines.append(line)
                line = word
            else:
                line = trial
        lines.append(line)
    return lines


def paragraph(draw, xy, value, size, width, color=INK, weight=400, family='body', leading=1.45):
    x, y = xy
    for line in lines_for(draw, value, size, width, weight, family):
        text(draw, (x, y), line, size, color, weight, family)
        y += round(size * leading)
    return y


def box(draw, bounds, fill=WHITE, radius=18, outline=None, width=1):
    draw.rounded_rectangle(bounds, radius, fill=fill, outline=outline, width=width)


def check(draw, x, y, color=RED, size=13):
    draw.line([(x, y + size // 2), (x + size // 2, y + size), (x + size * 1.5, y - size // 2)], fill=color, width=3)


def button(draw, label, y=780):
    bounds = (922, y, 1758, y + 62)
    box(draw, bounds, RED, 13)
    size = 24
    length = draw.textlength(label, font=font(size, 600))
    text(draw, (1340 - length / 2, y + 19), label, size, WHITE, 600)
    return bounds


def row(draw, label, value, x, y, width=388):
    text(draw, (x, y), label, 20, MUTED, 500)
    bounds = (x, y + 32, x + width, y + 92)
    box(draw, bounds, PAPER, 10)
    size = 23
    while draw.textlength(value, font=font(size, 500)) > width - 34 and size > 17:
        size -= 1
    if draw.textlength(value, font=font(size, 500)) > width - 34:
        raise ValueError(f'Field value does not fit: {value}')
    text(draw, (x + 17, y + 52), value, size, INK, 500)
    return bounds


def panel_frame(draw, scene):
    box(draw, (857, 201, 1831, 895), PAPER, 27)
    box(draw, (846, 188, 1820, 881), WHITE, 27)
    draw.line((846, 252, 1820, 252), fill=PAPER, width=2)
    for i in range(3):
        draw.ellipse((872 + i * 20, 215, 882 + i * 20, 225), fill=RED if i == 0 else PAPER)
    text(draw, (981, 213), 'ALISTER BANK  /  WEB ACCOUNT GUIDE', 18, MUTED, 500)
    text(draw, (1590, 213), 'ILLUSTRATION', 17, MUTED, 500)
    text(draw, (922, 299), scene['panelTitle'], 33, INK, 600, 'heading')
    text(draw, (922, 350), 'A simplified view of the steps in your application', 20, MUTED)


def render_scene(index):
    scene = SCENES[index]
    image = Image.new('RGB', (W, H), PAPER)
    d = ImageDraw.Draw(image)
    box(d, (94, 61, 150, 117), RED, 14)
    text(d, (110, 72), 'A', 33, WHITE, 700, 'heading')
    text(d, (167, 67), 'ALISTER BANK', 24, INK, 650)
    text(d, (168, 101), 'ACCOUNT OPENING GUIDE', 14, MUTED, 550)
    text(d, (1450, 82), 'FROM APPLICATION TO LOGIN', 18, MUTED, 500)
    d.line((94, 152, 1820, 152), fill=WHITE, width=3)
    text(d, (96, 200), scene['chapter'].upper(), 19, RED, 650)
    title_size = 72
    while len(lines_for(d, scene['title'], title_size, 710, 600, 'heading')) > 3:
        title_size -= 2
    paragraph(d, (92, 260), scene['title'], title_size, 712, INK, 600, 'heading', 1.1)
    end = paragraph(d, (96, 530), scene['description'], 28, 676, MUTED, leading=1.45)
    y = max(695, end + 25)
    for number, item in enumerate(scene['steps'], 1):
        box(d, (96, y, 127, y + 31), WHITE, 8)
        text(d, (106, y + 6), str(number), 17, RED, 650)
        y = paragraph(d, (146, y + 1), item, 25, 627, INK, leading=1.3) + 23
    if y > 935:
        raise ValueError(f'Text overflow in {scene["id"]}: {y}')
    panel_frame(d, scene)
    focus = []
    kind = scene['panel']
    if kind in ('journey', 'finish'):
        stages = [('Apply', 'Personal details, address and documents'), ('Verify', 'Email code, face check and ID review'), ('Activate', 'Sandbox step and credential setup'), ('Sign in', 'Your account dashboard')]
        for j, (label, detail) in enumerate(stages):
            yy = 409 + j * 99
            box(d, (922, yy, 983, yy + 61), RED if kind == 'journey' and j == 0 else PAPER, 16)
            if kind == 'finish':
                check(d, 941, yy + 29, RED, 15)
            else:
                text(d, (944, yy + 16), str(j + 1), 28, WHITE if j == 0 else RED, 600)
            text(d, (1010, yy + 3), label, 29, INK, 600, 'heading')
            text(d, (1010, yy + 43), detail, 22, MUTED)
            focus.append((916, yy - 7, 1764, yy + 75))
    elif kind == 'form':
        fields = scene['fields']
        columns = len(fields) == 6
        for j, (label, value) in enumerate(fields):
            x = 922 + (436 if columns and j % 2 else 0)
            y = 405 + (j // 2 if columns else j) * (119 if columns else 86)
            if columns:
                focus.append(row(d, label, value, x, y, 400))
            else:
                text(d, (922, y), label, 19, MUTED, 500)
                bounds = (1245, y - 14, 1758, y + 46)
                box(d, bounds, PAPER, 10)
                text(d, (1262, y + 7), value, 22, INK, 500)
                focus.append(bounds)
        focus.append(button(d, scene['button'], 800))
    elif kind in ('checklist', 'documents'):
        for j, item in enumerate(scene['items']):
            yy = 405 + j * 81
            box(d, (922, yy, 1758, yy + 65), PAPER, 12)
            check(d, 942, yy + 32, RED, 12)
            text(d, (981, yy + 23), item, 23, INK, 500)
            focus.append((922, yy, 1758, yy + 65))
        if kind == 'documents':
            text(d, (924, 747), 'Passport and address proof: optional for India', 21, MUTED)
        focus.append(button(d, scene.get('button', 'Request Account Access'), 800))
    elif kind == 'otp':
        box(d, (922, 410, 1758, 493), PAPER, 12)
        text(d, (945, 427), 'Code sent to', 20, MUTED)
        text(d, (945, 457), 'alex@example.com', 24, INK, 550)
        text(d, (1632, 445), 'Change', 22, RED, 550)
        text(d, (1074, 534), 'Enter your own six-digit code', 25, INK, 500)
        for j in range(6):
            xx = 1041 + j * 102
            bounds = (xx, 590, xx + 83, 680)
            box(d, bounds, PAPER, 12)
            text(d, (xx + 30, 615), '•', 35, INK, 500)
            focus.append(bounds)
        text(d, (1096, 715), 'Never share your verification code.', 22, MUTED)
        focus.append(button(d, scene['button'], 800))
    elif kind == 'email':
        box(d, (922, 410, 1758, 751), PAPER, 17)
        text(d, (952, 439), 'YOUR REGISTERED INBOX', 18, MUTED, 600)
        text(d, (952, 494), 'Complete your Video KYC', 33, INK, 600, 'heading')
        paragraph(d, (952, 553), 'Your next verification step is ready. Open your personal secure link to continue.', 25, 714, MUTED)
        text(d, (952, 675), 'Personal link  /  Keep private  /  Expires', 21, RED, 550)
        focus.append(button(d, scene['button'], 800))
    elif kind == 'face':
        d.ellipse((1207, 396, 1467, 656), outline=RED, width=5)
        d.ellipse((1294, 439, 1380, 525), fill=PAPER)
        d.rounded_rectangle((1255, 542, 1419, 608), 33, fill=PAPER)
        text(d, (1157, 686), 'Position. Move. Blink.', 32, INK, 550, 'heading')
        text(d, (1060, 736), 'Follow the instructions shown on your screen', 22, MUTED)
        focus = [(1207, 396, 1467, 656)]
    elif kind == 'identity':
        box(d, (1080, 409, 1590, 661), PAPER, 19)
        text(d, (1110, 435), 'IDENTITY DOCUMENT', 23, INK, 600)
        box(d, (1111, 487, 1211, 610), WHITE, 10)
        d.ellipse((1142, 507, 1180, 545), fill=MUTED)
        box(d, (1131, 556, 1191, 590), MUTED, 13)
        text(d, (1243, 494), 'Your legal name', 23, INK, 500)
        text(d, (1243, 536), 'Date of birth', 22, MUTED)
        text(d, (1243, 576), '••••  ••••  ••••', 23, MUTED)
        text(d, (1172, 631), 'SAMPLE · NOT AN ID', 17, RED, 600)
        text(d, (1041, 715), 'Review extracted details before submitting.', 24, MUTED)
        focus = [(1068, 397, 1602, 673), button(d, scene['button'], 800)]
    elif kind == 'deposit':
        box(d, (922, 407, 1758, 472), RED, 12)
        text(d, (1119, 430), 'SANDBOX · NO REAL PAYMENT', 23, WHITE, 600)
        text(d, (923, 512), 'Required minimum', 21, MUTED)
        text(d, (923, 551), 'Use the amount shown in your link', 30, INK, 550, 'heading')
        focus.append(row(d, 'Payment card', 'Admin-approved test card only', 922, 620, 836))
        text(d, (923, 744), 'Never enter real card details in this simulation.', 23, RED, 500)
        focus.append(button(d, scene['button'], 800))
    elif kind == 'login':
        box(d, (922, 400, 1758, 449), PAPER, 10)
        box(d, (926, 404, 1337, 445), RED, 8)
        text(d, (1070, 414), 'Password', 23, WHITE, 600)
        text(d, (1461, 414), 'Scan to Login', 23, MUTED)
        focus.append(row(d, 'Username or Email', 'alex@example.com', 922, 483, 836))
        focus.append(row(d, 'Password', '••••••••••••', 922, 598, 400))
        focus.append(row(d, 'CAPTCHA', 'Type the characters shown', 1358, 598, 400))
        text(d, (1556, 722), 'Forgot password?', 21, RED, 500)
        focus.append(button(d, scene['button'], 800))
    box(d, (94, 944, 1820, 994), WHITE, 12)
    text(d, (116, 960), scene['note'], 22, INK, 500)
    text(d, (94, 1033), 'ILLUSTRATED WALKTHROUGH  ·  EXAMPLE DATA ONLY', 16, MUTED, 500)
    text(d, (1596, 1033), f'{index + 1:02d} / {len(SCENES):02d}  CHAPTERS', 16, MUTED, 500)
    return image, focus


def timestamp(seconds, separator='.'):
    ms = round(seconds * 1000)
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d}{separator}{ms % 1000:03d}'


def write_captions():
    vtt, srt, metadata = ['WEBVTT', ''], [], [';FFMETADATA1', 'title=Alister Bank | From application to login', 'comment=Illustrated tutorial; activation deposit is a sandbox simulation.']
    elapsed, cue = 0, 0
    for scene in SCENES:
        words = scene['transcript'].split()
        chunks = [' '.join(words[i:i + 13]) for i in range(0, len(words), 13)]
        for j, line in enumerate(chunks):
            start = elapsed + scene['duration'] * j / len(chunks)
            end = elapsed + scene['duration'] * (j + 1) / len(chunks)
            cue += 1
            vtt.extend([f'{timestamp(start)} --> {timestamp(end)}', line, ''])
            srt.extend([str(cue), f'{timestamp(start, ",")} --> {timestamp(end, ",")}', line, ''])
        metadata.extend(['[CHAPTER]', 'TIMEBASE=1/1000', f'START={elapsed * 1000}', f'END={(elapsed + scene["duration"]) * 1000}', f'title={scene["chapter"]}'])
        elapsed += scene['duration']
    (OUTPUT / 'alister-account-guide.en.vtt').write_text('\n'.join(vtt))
    (OUTPUT / 'alister-account-guide.en.srt').write_text('\n'.join(srt))
    (WORK / 'chapters.txt').write_text('\n'.join(metadata))


def soundtrack():
    # Original, quiet synthesized instrumental; no third-party music assets.
    rate = 44100
    audio = np.zeros(round(TOTAL * rate), dtype=np.float32)
    chords = [(48, 55, 59, 64), (45, 52, 55, 60), (41, 48, 52, 57), (43, 50, 55, 59)]
    beat = 60 / 88
    for step in range(math.ceil(TOTAL / beat)):
        chord = chords[(step // 8) % len(chords)]
        note = chord[step % len(chord)] + (12 if step % 2 else 0)
        frequency = 440 * 2 ** ((note - 69) / 12)
        duration = min(3.5, TOTAL - step * beat)
        if duration <= 0:
            continue
        t = np.arange(round(duration * rate), dtype=np.float32) / rate
        envelope = (1 - np.exp(-t * 45)) * np.exp(-t * 1.8) * np.minimum(1, (duration - t) * 10)
        tone = (np.sin(2 * np.pi * frequency * t) + .22 * np.sin(4 * np.pi * frequency * t)) * envelope * .055
        start = round(step * beat * rate)
        count = min(len(tone), len(audio) - start)
        audio[start:start + count] += tone[:count]
    audio[:rate * 3] *= np.linspace(0, 1, rate * 3)
    audio[-rate * 4:] *= np.linspace(1, 0, rate * 4)
    with wave.open(str(WORK / 'instrumental.wav'), 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes((np.clip(audio, -1, 1) * 32767).astype('<i2').tobytes())


def render_video(images):
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    command = [ffmpeg, '-y', '-loglevel', 'warning', '-f', 'rawvideo', '-vcodec', 'rawvideo', '-s', f'{W}x{H}', '-pix_fmt', 'rgb24', '-r', str(FPS), '-i', '-', '-i', str(WORK / 'instrumental.wav'), '-i', str(WORK / 'chapters.txt'), '-map', '0:v', '-map', '1:a', '-map_metadata', '2', '-map_chapters', '2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-threads', '2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-shortest', str(OUTPUT / 'alister-account-guide.mp4')]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    elapsed = 0
    try:
        for index, (base, focus) in enumerate(images):
            duration = SCENES[index]['duration']
            print(f'Rendering {index + 1}/{len(SCENES)}: {SCENES[index]["id"]}', flush=True)
            for frame in range(duration * FPS):
                seconds = frame / FPS
                if seconds < .5:
                    before = images[index - 1][0] if index else Image.new('RGB', (W, H), PAPER)
                    progress = seconds / .5
                    image = Image.blend(before, base, progress * progress * (3 - 2 * progress))
                else:
                    image = base.copy()
                d = ImageDraw.Draw(image)
                if seconds > 1 and focus:
                    active = min(len(focus) - 1, int((seconds - 1) / max(1, duration - 2) * len(focus)))
                    bounds = focus[active]
                    box(d, bounds, None, 12 if SCENES[index]['panel'] != 'face' else 130, RED, 3)
                    x, y = bounds[2] - 12, bounds[3] - 10
                    radius = 6 + round(2 * math.sin(seconds * 3))
                    d.ellipse((x - radius, y - radius, x + radius, y + radius), fill=RED)
                x = 94
                available = 1726 - 6 * (len(SCENES) - 1)
                for chapter, scene in enumerate(SCENES):
                    width = available * scene['duration'] / TOTAL
                    box(d, (x, 1010, x + width, 1015), WHITE, 2)
                    fill = 1 if chapter < index else seconds / duration if chapter == index else 0
                    if fill > 0:
                        box(d, (x, 1010, x + max(2, width * fill), 1015), RED, 2)
                    x += width + 6
                process.stdin.write(image.tobytes())
            elapsed += duration
    finally:
        process.stdin.close()
    if process.wait() != 0:
        raise RuntimeError('Video encoding failed')
    result = subprocess.run([ffmpeg, '-v', 'error', '-i', str(OUTPUT / 'alister-account-guide.mp4'), '-f', 'null', '-'], capture_output=True, text=True)
    if result.returncode or result.stderr.strip():
        raise RuntimeError(f'Video decode verification failed: {result.stderr}')
    print(f'Encoded and decoded successfully: {TOTAL}s, {W}x{H}, {FPS}fps', flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--stills', action='store_true')
    args = parser.parse_args()
    WORK.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for family, url in FONT_URLS.items():
        path = WORK / f'{family}.ttf'
        if not path.exists():
            with urllib.request.urlopen(url, timeout=30) as response:
                path.write_bytes(response.read())
    images = [render_scene(i) for i in range(len(SCENES))]
    images[0][0].save(OUTPUT / 'alister-account-guide-poster.webp', quality=90)
    sheet = Image.new('RGB', (1280, 360 * math.ceil(len(SCENES) / 2)), PAPER)
    for i, (image, _) in enumerate(images):
        sheet.paste(image.resize((640, 360)), ((i % 2) * 640, (i // 2) * 360))
    sheet.save(WORK / 'contact-sheet.jpg', quality=92)
    images[5][0].save(WORK / 'documents.png')
    images[11][0].save(WORK / 'activation.png')
    write_captions()
    if not args.stills:
        soundtrack()
        render_video(images)
    print(f'Assets: {OUTPUT}\nLayout proof: {WORK / "contact-sheet.jpg"}', flush=True)


if __name__ == '__main__':
    main()
