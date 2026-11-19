#!/usr/bin/env python3
"""Re-level the animal sounds in web/public/learning/audio so they all play at the same, comfortable volume.

Why: the first pass (media_tools.py, single-pass loudnorm to -16 LUFS) left clips anywhere from -11 to -25 LUFS and
eight of them with true peaks above 0 dBTP (they clip on playback). Single-pass loudnorm on short, bursty clips
(a bark in a quiet field) cannot hit its target, and -16 LUFS is loud for a wall speaker that a toddler stands next to.

What this does to every clip, in place:
  1. high-pass at 70 Hz (rumble and wind add loudness but no information)
  2. gentle 3:1 compression above -20 dBFS (a roar no longer drowns out the rest of the clip)
  3. two-pass, linear loudnorm to -20 LUFS with a -3 dBTP ceiling (so MP3 overshoot cannot clip either)
  4. re-encode mono 44.1 kHz MP3 at 192 kbps

Usage:  python relevel_audio.py [--dry-run] [name ...]     (no names = every clip)
Needs:  pip install imageio-ffmpeg
"""
import glob
import json
import os
import subprocess
import sys

import imageio_ffmpeg

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', 'web', 'public', 'learning', 'audio'))
TARGET_I = -20.0
TARGET_TP = -3.0
TARGET_LRA = 7.0
PRE = 'highpass=f=70,acompressor=threshold=0.1:ratio=3:attack=8:release=150:makeup=1'
FF = imageio_ffmpeg.get_ffmpeg_exe()


def measure(path):
    af = f'{PRE},loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}:print_format=json'
    err = subprocess.run([FF, '-hide_banner', '-i', path, '-af', af, '-f', 'null', '-'], capture_output=True, text=True).stderr
    return json.loads(err[err.rfind('{'):err.rfind('}') + 1])


def loudness(path):
    err = subprocess.run([FF, '-hide_banner', '-i', path, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
    j = json.loads(err[err.rfind('{'):err.rfind('}') + 1])
    return float(j['input_i']), float(j['input_tp'])


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry = '--dry-run' in sys.argv
    files = sorted(glob.glob(os.path.join(ROOT, '*.mp3')))
    if args:
        files = [f for f in files if os.path.basename(f)[:-4] in args]
    print(f'{len(files)} clips in {ROOT}')
    for f in files:
        name = os.path.basename(f)[:-4]
        before = loudness(f)
        m = measure(f)
        af = (f'{PRE},loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}'
              f":measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
              f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
        tmp = f + '.tmp.mp3'
        if not dry:
            subprocess.run([FF, '-y', '-loglevel', 'error', '-i', f, '-ac', '1', '-ar', '44100', '-af', af,
                            '-codec:a', 'libmp3lame', '-b:a', '192k', tmp], check=True)
            os.replace(tmp, f)
            after = loudness(f)
        else:
            after = (float('nan'), float('nan'))
        print(f'{name:22} {before[0]:6.1f} LUFS / {before[1]:5.1f} dBTP  ->  {after[0]:6.1f} LUFS / {after[1]:5.1f} dBTP')


if __name__ == '__main__':
    main()
