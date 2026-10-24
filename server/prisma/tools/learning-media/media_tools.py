#!/usr/bin/env python
"""Toolkit for sourcing free-licensed photos and animal sounds from Wikimedia Commons.

Usage (run with: python media_tools.py <command> ...):

  search "<query>" [--type image|audio] [--limit 15]
      Lists Commons files with size, duration (audio), LICENSE verdict (OK/NO), author, description.
      Only trust rows marked LICENSE OK. Use specific queries ("African lion male portrait",
      "Panthera leo vocalization", "Gallus gallus domesticus crowing").

  cats "<query>"
      Searches Commons CATEGORIES. Audio is organised by category, so for sounds start here:
      e.g. cats "lion sounds", cats "Audio files of Panthera leo", cats "Category:Cat sounds".
  list-cat "Category:Cat sounds" [--sub] [--limit 40]
      Lists the files in a category (--sub also lists its subcategories' files) with license verdicts.
      Useful roots: "Category:Audio files of animal sounds", "Category:Audio files of animals",
      "Category:Audio files of animal sounds from the United States Fish and Wildlife Service".

  fetch-image "File:Name.jpg" <slug> [--focus 0.5,0.5] [--zoom 1.0] [--contain]
      (--contain: never crop - fit the whole image on white; use for flags, diagrams, coins, maps)
      Downloads, crops to 4:3 around the focus point (x,y in 0-1; zoom>1 crops tighter),
      writes web/public/learning/img/<slug>.webp (1000x750) and prints the path. LOOK at the result
      with the Read tool: the animal must be clearly visible, fully framed, in focus.

  fetch-audio "File:Name.ogg" <slug> [--start 0] [--dur 8]
      Downloads, trims, normalizes loudness, fades the ends, writes
      web/public/learning/audio/<slug>.mp3 (192 kbps) and prints duration / peak / mean volume
      and a QUALITY verdict. Reject clips that are mostly silence, clipped, or very noisy.

  save-meta <slug>   (reads JSON from stdin)   writes media/manifest/<slug>.json

All files are real recordings/photographs - nothing synthetic. Be polite: sleep between calls.
"""
import io
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request

ROOT = r'C:\Users\sheac\Github Personal\Family Calendar System\web\public\learning'
MANIFEST = r'C:\Users\sheac\AppData\Local\Temp\claude\C--Users-sheac-Github-Personal\d3295f37-d84f-43de-aa58-cf3e2dc83375\scratchpad\media\manifest'
API = 'https://commons.wikimedia.org/w/api.php'
UA = 'RoostHQ-learning-media/1.0 (https://roosthq.org; family learning app; contact casey@fullbay.com)'

OK_LICENSE = re.compile(r'^(public domain|pd\b|pd-|cc0|cc[- ]by(?!-nc)(?!-nd)(?:[- ]sa)?[- ]\d|cc[- ]by(?:[- ]sa)?$|attribution|no restrictions|copyrighted free use|usgov|us government|u\.s\. gov)', re.I)
BAD_LICENSE = re.compile(r'(nc|nd\b|non-?commercial|no derivatives|fair use|all rights|gfdl-only|gfdl$)', re.I)


def ffmpeg():
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def http(url, binary=False, retries=4):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            return data if binary else data.decode('utf-8')
        except Exception as e:  # noqa
            if i == retries - 1:
                raise
            time.sleep(2 + 3 * i)


def strip_html(s):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', s or '')).strip()


def license_verdict(ext):
    lic = (ext.get('LicenseShortName') or {}).get('value', '')
    if not lic:
        return 'NO', 'no license info'
    if BAD_LICENSE.search(lic):
        return 'NO', lic
    if OK_LICENSE.search(lic):
        return 'OK', lic
    return 'NO', lic + ' (unrecognized)'


def query_files(q, kind, limit):
    suffix = ' filetype:audio' if kind == 'audio' else ' filetype:bitmap'
    params = {
        'action': 'query',
        'format': 'json',
        'generator': 'search',
        'gsrnamespace': '6',
        'gsrsearch': q + suffix,
        'gsrlimit': str(limit),
        'prop': 'imageinfo',
        'iiprop': 'url|size|mime|extmetadata|mediatype',
        'iiurlwidth': '1600',
    }
    data = json.loads(http(API + '?' + urllib.parse.urlencode(params)))
    pages = (data.get('query') or {}).get('pages') or {}
    return sorted(pages.values(), key=lambda p: p.get('index', 0))


def cmd_search(args):
    kind = 'image'
    limit = 15
    if '--type' in args:
        kind = args[args.index('--type') + 1]
    if '--limit' in args:
        limit = int(args[args.index('--limit') + 1])
    q = args[0]
    for p in query_files(q, kind, limit):
        ii = (p.get('imageinfo') or [{}])[0]
        ext = ii.get('extmetadata') or {}
        verdict, lic = license_verdict(ext)
        dur = ii.get('duration')
        dims = f"{ii.get('width')}x{ii.get('height')}" if ii.get('width') else ''
        desc = strip_html((ext.get('ImageDescription') or {}).get('value', ''))[:140]
        author = strip_html((ext.get('Artist') or {}).get('value', ''))[:50]
        print(f"[{verdict}] {p['title']} | {dims} {('%.1fs' % dur) if dur else ''} | {lic} | {author} | {desc}")


def cmd_cats(args):
    """Search Commons CATEGORIES (audio is organised by category, free-text search misses it)."""
    q = args[0]
    params = {'action': 'query', 'format': 'json', 'list': 'search', 'srnamespace': '14', 'srsearch': q, 'srlimit': '15'}
    for x in json.loads(http(API + '?' + urllib.parse.urlencode(params)))['query']['search']:
        print(x['title'])


def cmd_list_cat(args):
    """List files in a category (and optionally one level of subcategories) with license verdicts."""
    cat = args[0]
    limit = int(args[args.index('--limit') + 1]) if '--limit' in args else 40
    titles = [cat]
    if '--sub' in args:
        params = {'action': 'query', 'format': 'json', 'list': 'categorymembers', 'cmtitle': cat, 'cmtype': 'subcat', 'cmlimit': '30'}
        titles += [x['title'] for x in json.loads(http(API + '?' + urllib.parse.urlencode(params)))['query']['categorymembers']]
    for t in titles:
        params = {
            'action': 'query', 'format': 'json', 'generator': 'categorymembers', 'gcmtitle': t, 'gcmtype': 'file', 'gcmlimit': str(limit),
            'prop': 'imageinfo', 'iiprop': 'url|size|mime|extmetadata|mediatype', 'iiurlwidth': '1600',
        }
        pages = (json.loads(http(API + '?' + urllib.parse.urlencode(params))).get('query') or {}).get('pages') or {}
        if not pages:
            continue
        print('##', t)
        for p in sorted(pages.values(), key=lambda p: p.get('index', 0)):
            ii = (p.get('imageinfo') or [{}])[0]
            ext = ii.get('extmetadata') or {}
            verdict, lic = license_verdict(ext)
            dur = ii.get('duration')
            desc = strip_html((ext.get('ImageDescription') or {}).get('value', ''))[:120]
            author = strip_html((ext.get('Artist') or {}).get('value', ''))[:40]
            print(f"[{verdict}] {p['title']} | {ii.get('mime')} {('%.1fs' % dur) if dur else ''} | {lic} | {author} | {desc}")


def find_file(title):
    params = {
        'action': 'query',
        'format': 'json',
        'titles': title,
        'prop': 'imageinfo',
        'iiprop': 'url|size|mime|extmetadata',
        'iiurlwidth': '1600',
    }
    data = json.loads(http(API + '?' + urllib.parse.urlencode(params)))
    pages = (data.get('query') or {}).get('pages') or {}
    p = next(iter(pages.values()))
    if 'imageinfo' not in p:
        raise SystemExit('file not found: ' + title)
    return p, p['imageinfo'][0]


def meta_from(p, ii):
    ext = ii.get('extmetadata') or {}
    verdict, lic = license_verdict(ext)
    return {
        'title': p['title'],
        'license': lic,
        'licenseOk': verdict == 'OK',
        'author': strip_html((ext.get('Artist') or {}).get('value', '')) or 'Unknown',
        'sourceUrl': ii.get('descriptionurl') or ii.get('url'),
        'licenseUrl': (ext.get('LicenseUrl') or {}).get('value', ''),
        'attribution': strip_html((ext.get('Attribution') or {}).get('value', '')),
    }


def cmd_fetch_image(args):
    from PIL import Image

    title, slug = args[0], args[1]
    fx, fy = 0.5, 0.5
    zoom = 1.0
    if '--focus' in args:
        fx, fy = [float(v) for v in args[args.index('--focus') + 1].split(',')]
    if '--zoom' in args:
        zoom = float(args[args.index('--zoom') + 1])
    p, ii = find_file(title)
    meta = meta_from(p, ii)
    if not meta['licenseOk']:
        raise SystemExit(f"REFUSED: license not allowed ({meta['license']})")
    url = ii.get('thumburl') or ii['url']
    raw = http(url, binary=True)
    im = Image.open(io.BytesIO(raw)).convert('RGBA')
    bgc = Image.new('RGBA', im.size, (255, 255, 255, 255))
    bgc.alpha_composite(im)
    im = bgc.convert('RGB')
    w, h = im.size
    target = 4 / 3
    if '--contain' in args:
        # Flags/diagrams: never crop - fit the WHOLE image inside 1000x750 on white.
        scale = min(1000 / w, 750 / h)
        nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
        canvas = Image.new('RGB', (1000, 750), (255, 255, 255))
        canvas.paste(im.resize((nw, nh), Image.LANCZOS), ((1000 - nw) // 2, (750 - nh) // 2))
        os.makedirs(os.path.join(ROOT, 'img'), exist_ok=True)
        out = os.path.join(ROOT, 'img', slug + '.webp')
        canvas.save(out, 'WEBP', quality=88, method=6)
        meta['file'] = f'learning/img/{slug}.webp'
        meta['sourceSize'] = f'{w}x{h}'
        print(json.dumps({'written': out, 'bytes': os.path.getsize(out), 'meta': meta}))
        return
    if w / h > target:
        ch = h / zoom
        cw = ch * target
    else:
        cw = w / zoom
        ch = cw / target
    cx = min(max(fx * w, cw / 2), w - cw / 2)
    cy = min(max(fy * h, ch / 2), h - ch / 2)
    box = (int(cx - cw / 2), int(cy - ch / 2), int(cx + cw / 2), int(cy + ch / 2))
    im = im.crop(box).resize((1000, 750), Image.LANCZOS)
    os.makedirs(os.path.join(ROOT, 'img'), exist_ok=True)
    out = os.path.join(ROOT, 'img', slug + '.webp')
    im.save(out, 'WEBP', quality=86, method=6)
    meta['file'] = f'learning/img/{slug}.webp'
    meta['sourceSize'] = f'{w}x{h}'
    print(json.dumps({'written': out, 'bytes': os.path.getsize(out), 'meta': meta}))


def cmd_fetch_audio(args):
    title, slug = args[0], args[1]
    start, dur = 0.0, 8.0
    if '--start' in args:
        start = float(args[args.index('--start') + 1])
    if '--dur' in args:
        dur = float(args[args.index('--dur') + 1])
    p, ii = find_file(title)
    meta = meta_from(p, ii)
    if not meta['licenseOk']:
        raise SystemExit(f"REFUSED: license not allowed ({meta['license']})")
    raw = http(ii['url'], binary=True)
    tmp = os.path.join(os.environ.get('TEMP', '.'), f'rhq_{slug}_src')
    with open(tmp, 'wb') as f:
        f.write(raw)
    os.makedirs(os.path.join(ROOT, 'audio'), exist_ok=True)
    out = os.path.join(ROOT, 'audio', slug + '.mp3')
    ff = ffmpeg()
    af = f'loudnorm=I=-16:TP=-1.5:LRA=7,afade=t=in:d=0.04,afade=t=out:st={max(0.1, dur - 0.35)}:d=0.35'
    subprocess.run([ff, '-y', '-loglevel', 'error', '-ss', str(start), '-t', str(dur), '-i', tmp, '-ac', '1', '-ar', '44100', '-af', af, '-codec:a', 'libmp3lame', '-b:a', '192k', out], check=True)
    os.remove(tmp)
    # stats on the OUTPUT clip
    r = subprocess.run([ff, '-hide_banner', '-i', out, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True)
    txt = r.stderr
    mean = re.search(r'mean_volume: (-?[\d.]+) dB', txt)
    peak = re.search(r'max_volume: (-?[\d.]+) dB', txt)
    d = re.search(r'Duration: (\d+):(\d+):([\d.]+)', txt)
    seconds = int(d.group(1)) * 3600 + int(d.group(2)) * 60 + float(d.group(3)) if d else 0
    # fraction of the clip that is near-silent: compare 0.25s windows via silencedetect
    s = subprocess.run([ff, '-hide_banner', '-i', out, '-af', 'silencedetect=n=-45dB:d=0.4', '-f', 'null', '-'], capture_output=True, text=True).stderr
    sil = sum(float(x) for x in re.findall(r'silence_duration: ([\d.]+)', s))
    quality = 'GOOD'
    notes = []
    if seconds < 1.2:
        quality = 'BAD'
        notes.append('too short')
    if sil / max(seconds, 0.1) > 0.45:
        quality = 'BAD'
        notes.append(f'{int(100 * sil / seconds)}% silence')
    if mean and float(mean.group(1)) < -32:
        quality = 'BAD'
        notes.append('very quiet/noisy')
    if peak and float(peak.group(1)) > -0.2:
        notes.append('peaks near 0 dB')
    meta['file'] = f'learning/audio/{slug}.mp3'
    meta['seconds'] = round(seconds, 2)
    print(json.dumps({'written': out, 'bytes': os.path.getsize(out), 'quality': quality, 'notes': notes, 'meanDb': mean and float(mean.group(1)), 'peakDb': peak and float(peak.group(1)), 'silenceSec': round(sil, 2), 'meta': meta}))


def cmd_save_meta(args):
    slug = args[0]
    data = json.loads(sys.stdin.read())
    os.makedirs(MANIFEST, exist_ok=True)
    with open(os.path.join(MANIFEST, slug + '.json'), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print('saved', slug)


if __name__ == '__main__':
    cmd, rest = sys.argv[1], sys.argv[2:]
    {'cats': cmd_cats, 'list-cat': cmd_list_cat, 'search': cmd_search, 'fetch-image': cmd_fetch_image, 'fetch-audio': cmd_fetch_audio, 'save-meta': cmd_save_meta}[cmd](rest)
