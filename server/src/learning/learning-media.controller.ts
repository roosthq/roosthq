import { Controller, Get, Header, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { LearningService } from './learning.service';

// Serves owner-uploaded Learning photos and sounds. Deliberately NOT behind
// AuthGuard: an <img>/<audio> tag can't send the kiosk token header, and the
// ids are unguessable (cuid). Range support is not optional - iOS Safari will
// not play an <audio> element from a server that ignores Range requests.
@Controller('learning/media')
export class LearningMediaController {
  constructor(private learning: LearningService) {}

  @Get(':id')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  async file(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    if (!/^[a-z0-9]{10,40}$/.test(id)) return res.status(404).end();
    let file: { mime: string; data: Buffer };
    try {
      file = await this.learning.getMediaFile(id);
    } catch {
      return res.status(404).end();
    }
    const total = file.data.length;
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Accept-Ranges', 'bytes');
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
    if (range && (range[1] || range[2])) {
      let start = range[1] ? Number(range[1]) : Math.max(0, total - Number(range[2]));
      let end = range[1] && range[2] ? Number(range[2]) : total - 1;
      end = Math.min(end, total - 1);
      if (start > end || start >= total) {
        res.setHeader('Content-Range', `bytes */${total}`);
        return res.status(416).end();
      }
      start = Math.max(0, start);
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', String(end - start + 1));
      return res.end(file.data.subarray(start, end + 1));
    }
    res.setHeader('Content-Length', String(total));
    return res.end(file.data);
  }
}
