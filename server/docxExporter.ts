import type express from 'express';
import sharp from 'sharp';
import { db, type User } from './db.ts';
import { BOOK_THEMES, DEFAULT_DESIGN_CONFIG } from '../src/constants/themes.ts';
import type { BookDesignConfig } from '../src/types.ts';

function getRequestUser(req: express.Request): User | null {
  const authHeader = req.headers.authorization;
  let token: string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.query && typeof req.query.token === 'string') {
    token = req.query.token.trim();
  }
  if (token) {
    return db.getSessionUser(token);
  }
  return null;
}

function cleanChapterTitle(title: any): string {
  if (!title) return 'فصل کتاب';
  const str = typeof title === 'string' ? title : String(title);
  return (
    str
      .replace(/\s*[\(\[\{]\s*بخش\s*[0-9۰-۹IVXLCDMivxlcdm]+\s*[\)\]\}]/gi, '')
      .replace(/\s*[-–—|:]\s*بخش\s*[0-9۰-۹IVXLCDMivxlcdm]+/gi, '')
      .replace(/\s+بخش\s+[0-9۰-۹IVXLCDMivxlcdm]+$/gi, '')
      .replace(/\s*[\(\[\{]\s*(?:Part|Section|Chunk)\s*[0-9۰-۹IVXLCDMivxlcdm]+\s*[\)\]\}]/gi, '')
      .replace(/\s*[-–—|:]\s*(?:Part|Section|Chunk)\s*[0-9۰-۹IVXLCDMivxlcdm]+/gi, '')
      .trim() || 'فصل کتاب'
  );
}

function cleanFontFamily(fontName: string = 'Vazirmatn'): string {
  if (!fontName) return 'Vazirmatn';
  return fontName.replace(/\s+(Medium|Regular|Bold|Light|SemiBold|Black)$/i, '').trim() || 'Vazirmatn';
}

function createFontDef(fontName: string = 'Vazirmatn') {
  const family = cleanFontFamily(fontName);
  return {
    name: family,
    cs: family,
    ascii: family,
    hAnsi: family,
    eastAsia: family,
  };
}

function normalizeHex(hex: string | undefined, fallback: string): string {
  if (!hex || typeof hex !== 'string') return fallback;
  const cleaned = hex.replace('#', '').trim().toUpperCase();
  if (/^[0-9A-F]{6}$/.test(cleaned)) return cleaned;
  if (/^[0-9A-F]{3}$/.test(cleaned)) {
    return cleaned
      .split('')
      .map(c => c + c)
      .join('');
  }
  return fallback;
}

function decodeHtmlEntities(text: string): string {
  if (!text) return '';
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&zwnj;/gi, '\u200c')
    .replace(/&zwj;/gi, '\u200d')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&laquo;/gi, '«')
    .replace(/&raquo;/gi, '»')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = Number(dec);
      return code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : '';
    });
}

function stripBookUrls(html: string): string {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<a\s+[^>]*href=["'][^"']*["'][^>]*>\s*https?:\/\/[^\s<]+<\/a>/gi, '')
    .replace(/<a\s+[^>]*href=["'][^"']*["'][^>]*>\s*www\.[^\s<]+<\/a>/gi, '')
    .replace(/<a\s+[^>]*href=["'][^"']*["'][^>]*>([\s\S]*?)<\/a>/gi, '$1')
    .replace(/https?:\/\/[^\s<>"'\)]+/gi, '')
    .replace(/(?:^|\s)(?:www\.)[a-z0-9\-]+(?:\.[a-z0-9\-]+)+(?:\/[^\s<>"'\)]*)?/gi, ' ')
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function sanitizeChunkHtml(html: string, seenImgSrcs: Set<string>): string {
  if (!html || typeof html !== 'string') return '';

  let sanitized = stripBookUrls(html)
    .replace(/<span[^>]*style=["'][^"']*#(?:9b2c2c|c53030|e53e3e)[^"']*["'][^>]*>([^<]*)<\/span>/gi, '$1')
    .replace(/<span[^>]*class=["'][^"']*highlight[^"']*["'][^>]*>([^<]*)<\/span>/gi, '$1')
    .replace(/<h[1-3][^>]*>\s*مقدمه و بخش نخست\s*(?:\([^\)]*\))?\s*<\/h[1-3]>/gi, '')
    .replace(/<h[1-3][^>]*>[^<]*[\(\[\{]\s*بخش\s*[0-9۰-۹IVXLCDMivxlcdm]+\s*[\)\]\}][^<]*<\/h[1-3]>/gi, '')
    .replace(/<p[^>]*>\s*[\(\[\{]?\s*بخش\s*[0-9۰-۹IVXLCDMivxlcdm]+\s*[\)\]\}]?\s*<\/p>/gi, '')
    .replace(/(?:margin-right|margin-left|padding-right|padding-left|text-indent)\s*:\s*[^;"]+;?/gi, '')
    // Bounded non-backtracking removal of LLM conversational boilerplate
    .replace(/(?:<p[^>]*>)?\s*(?:اگر|چنانچه|در\s+صورت\s+اینکه|در\s+صورتی\s+که|لطفاً|خواهشمند\s+است)\s+(?:متن\s+اصلی|متن\s+کتاب|پاراگراف‌ها|دیالوگ‌ها|ادامه\s+متن)[^<]{0,400}(?:ارائه\s+می‌?کنم|ترجمه\s+خواهم\s+کرد|ارسال\s+فرمایید|ارسال\s+کنید|در\s+اختیار\s+قرار\s+دهید|خدمت\s+شما\s+ارائه\s+می‌?گردد)[.!?؟\s]*(?:<\/p>)?/gi, '')
    .replace(/(?:<p[^>]*>)?\s*اگر\s+متن\s+اصلی\s*\([^\)]*\)\s*را\s+ارسال\s+کنید[^<]{0,300}(?:<\/p>)?/gi, '')
    .replace(/(?:<p[^>]*>)?\s*[^<]{0,200}رعایت\s+واژگان\s+تثبیت[^<]{0,200}پیوند\s+ریتمیک[^<]{0,120}(?:<\/p>)?/gi, '')
    .replace(/(?:<p[^>]*>)?\s*(?:لطفاً|خواهشمند\s+است)\s+متن\s+اصلی\s+را\s+ارسال\s+کنید[.!?؟\s]*(?:<\/p>)?/gi, '')
    .replace(/(?:<p[^>]*>)?\s*(?:Please provide the text|If you provide the text|Waiting for the text)[^<]{0,300}(?:<\/p>)?/gi, '')
    .trim();

  if (sanitized.includes('<img')) {
    sanitized = sanitized.replace(/<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi, (match, src) => {
      if (!src) return '';
      const fp = src.length > 250 ? src.slice(0, 250) : src;
      if (seenImgSrcs.has(fp)) return '';
      seenImgSrcs.add(fp);
      return match;
    });
    sanitized = sanitized
      .replace(/<figure[^>]*>\s*<\/figure>/gi, '')
      .replace(/<div class="[^"]*book-illustration-wrap[^"]*">\s*<\/div>/gi, '');
  }

  return sanitized;
}

function getImageDimensions(buf: Buffer): { width: number; height: number } {
  try {
    if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      if (w > 0 && h > 0) return { width: w, height: h };
    }
    if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let offset = 2;
      while (offset < buf.length - 8) {
        if (buf[offset] === 0xff) {
          const marker = buf[offset + 1];
          if (
            (marker >= 0xc0 && marker <= 0xc3) ||
            (marker >= 0xc5 && marker <= 0xc7) ||
            (marker >= 0xc9 && marker <= 0xcb) ||
            (marker >= 0xcd && marker <= 0xcf)
          ) {
            const h = buf.readUInt16BE(offset + 5);
            const w = buf.readUInt16BE(offset + 7);
            if (w > 0 && h > 0) return { width: w, height: h };
          }
          const segLen = buf.readUInt16BE(offset + 2);
          if (segLen < 2) break;
          offset += 2 + segLen;
        } else {
          offset++;
        }
      }
    }
  } catch {
    // ignore
  }
  return { width: 440, height: 280 };
}

function getProportionalDocxSize(buf: Buffer): { width: number; height: number } {
  const orig = getImageDimensions(buf);
  const ratio = orig.width / Math.max(1, orig.height);
  let targetW = Math.min(460, Math.max(160, orig.width));
  let targetH = Math.round(targetW / ratio);
  if (targetH > 480) {
    targetH = 480;
    targetW = Math.round(targetH * ratio);
  }
  return {
    width: Math.max(80, targetW),
    height: Math.max(60, targetH),
  };
}

async function normalizeImageBufferForDocx(dataUrl: string): Promise<{ buffer: Buffer; type: 'jpg' | 'png' | 'gif' } | null> {
  try {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return null;
    const header = dataUrl.slice(0, commaIdx).toLowerCase();
    const base64Data = dataUrl.slice(commaIdx + 1).replace(/\s+/g, '');
    if (!base64Data) return null;

    let imgBuffer = Buffer.from(base64Data, 'base64');
    if (imgBuffer.length < 16) return null;

    // Detect actual image magic bytes
    const isPng = imgBuffer[0] === 0x89 && imgBuffer[1] === 0x50 && imgBuffer[2] === 0x4e && imgBuffer[3] === 0x47;
    const isJpg = imgBuffer[0] === 0xff && imgBuffer[1] === 0xd8;
    const isGif = imgBuffer[0] === 0x47 && imgBuffer[1] === 0x49 && imgBuffer[2] === 0x46;

    if (isPng) return { buffer: imgBuffer, type: 'png' };
    if (isJpg) return { buffer: imgBuffer, type: 'jpg' };
    if (isGif) return { buffer: imgBuffer, type: 'gif' };

    // Convert WebP/AVIF/SVG/unknown image buffers to PNG via sharp so Word always opens cleanly
    if (header.includes('image/')) {
      const converted = await sharp(imgBuffer).png().toBuffer();
      return { buffer: converted, type: 'png' };
    }
    return null;
  } catch {
    return null;
  }
}

interface ParsedHtmlBlock {
  kind: 'h1' | 'h2' | 'h3' | 'blockquote' | 'p' | 'img' | 'divider' | 'footnote';
  innerHtml?: string;
  imageDataUrl?: string;
}

/**
 * Safely tokenizes book HTML into ordered blocks without broken nested-div captures.
 */
function extractHtmlBlocks(html: string): ParsedHtmlBlock[] {
  const blocks: ParsedHtmlBlock[] = [];
  if (!html || !html.trim()) return blocks;

  // Match fleuron dividers, footnotes, callouts (inner <p> or leaf blocks), headings, paragraphs, blockquotes, list items, figcaptions, and images
  const tokenRegex =
    /<div[^>]*class=["'][^"']*book-fleuron-divider[^"']*["'][^>]*>([\s\S]*?)<\/div>|<div[^>]*class=["'][^"']*book-footnote[^"']*["'][^>]*>([\s\S]*?)<\/div>|<(h[1-3]|p|blockquote|li|figcaption)[^>]*>([\s\S]*?)<\/\3>|<img\s+[^>]*src=["'](data:image\/[^"']+)["'][^>]*>/gi;

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(html)) !== null) {
    if (match[1] !== undefined) {
      blocks.push({ kind: 'divider', innerHtml: match[1] });
    } else if (match[2] !== undefined) {
      blocks.push({ kind: 'footnote', innerHtml: match[2] });
    } else if (match[3]) {
      const tag = match[3].toLowerCase();
      const inner = match[4] || '';

      // Extract any embedded images inside this block first
      const imgRegex = /<img\s+[^>]*src=["'](data:image\/[^"']+)["'][^>]*>/gi;
      let imgMatch: RegExpExecArray | null;
      while ((imgMatch = imgRegex.exec(inner)) !== null) {
        blocks.push({ kind: 'img', imageDataUrl: imgMatch[1] });
      }

      const cleanedInner = inner.replace(/<img[^>]*>/gi, '');
      const plainCheck = decodeHtmlEntities(cleanedInner.replace(/<[^>]+>/g, '')).trim();
      if (!plainCheck) continue;

      if (tag === 'h1') blocks.push({ kind: 'h1', innerHtml: cleanedInner });
      else if (tag === 'h2') blocks.push({ kind: 'h2', innerHtml: cleanedInner });
      else if (tag === 'h3') blocks.push({ kind: 'h3', innerHtml: cleanedInner });
      else if (tag === 'blockquote') blocks.push({ kind: 'blockquote', innerHtml: cleanedInner });
      else blocks.push({ kind: 'p', innerHtml: cleanedInner });
    } else if (match[5]) {
      blocks.push({ kind: 'img', imageDataUrl: match[5] });
    }
  }

  if (blocks.length === 0) {
    const lines = decodeHtmlEntities(html.replace(/<br\s*[\/]?>/gi, '\n').replace(/<[^>]+>/g, ''))
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      blocks.push({ kind: 'p', innerHtml: line });
    }
  }

  return blocks;
}

export async function handleExportDocxRequest(req: express.Request, res: express.Response) {
  try {
    const body = req.body || {};
    const bookId = typeof body.bookId === 'string' ? body.bookId.trim() : '';
    const useAdminCopy = Boolean(body.useAdminCopy);
    const pageRange = body.pageRange && typeof body.pageRange === 'object' ? body.pageRange : undefined;

    let rawTitle = typeof body.title === 'string' ? body.title.trim() : '';
    let rawAuthor = typeof body.author === 'string' ? body.author.trim() : '';
    let rawTranslator = typeof body.translator === 'string' ? body.translator.trim() : '';
    let rawOriginalTitle = typeof body.originalTitle === 'string' ? body.originalTitle.trim() : '';
    let incomingDesignConfig: Partial<BookDesignConfig> = (body.designConfig && typeof body.designConfig === 'object') ? body.designConfig : {};

    let chapterSources: Array<{ title: string; chunkHtmls: string[] }> = [];

    // 1. Prefer reading full book directly from server DB/disk by bookId (avoids multi-MB Nginx 413 payload limits!)
    if (bookId && bookId !== 'placeholder_book' && !bookId.startsWith('sample_')) {
      const serverBook = db.getBookById(bookId);
      if (serverBook) {
        const reqUser = getRequestUser(req);
        const isStaffOrAdmin = reqUser && (reqUser.role === 'admin' || reqUser.role === 'staff');
        const isOwner = reqUser && serverBook.userId === reqUser.id;
        if (serverBook.userId && !isOwner && !isStaffOrAdmin) {
          return res.status(403).json({ error: 'شما اجازه خروجی گرفتن از این کتاب را ندارید.' });
        }

        const sourceData = useAdminCopy && serverBook.adminCopy ? serverBook.adminCopy : serverBook;
        rawTitle = rawTitle || sourceData.title || serverBook.title || 'کتاب ترجمه شده';
        rawAuthor = rawAuthor || sourceData.author || serverBook.author || '';
        rawTranslator = rawTranslator || sourceData.translator || serverBook.translator || 'سامانه هوشمند ترجمه کتاب';
        rawOriginalTitle = rawOriginalTitle || sourceData.originalTitle || serverBook.originalTitle || '';

        incomingDesignConfig = {
          ...(serverBook.designConfig || {}),
          ...incomingDesignConfig,
        };

        const excludedSet = new Set<string>([
          ...((serverBook.designConfig?.excludedChunkIds as string[]) || []),
          ...((incomingDesignConfig.excludedChunkIds as string[]) || []),
        ]);

        let rawChunks: any[] = Array.isArray(sourceData.chunks) ? sourceData.chunks : [];

        // Apply optional 1-based pageRange slicing over book chunks
        if (pageRange && (Number(pageRange.start) > 0 || Number(pageRange.end) > 0)) {
          const startIdx = Math.max(0, (Number(pageRange.start) || 1) - 1);
          const endIdx = Number(pageRange.end) > 0 ? Math.min(rawChunks.length, Number(pageRange.end)) : rawChunks.length;
          rawChunks = rawChunks.slice(startIdx, endIdx);
        }

        const validChunks = rawChunks.filter(
          c =>
            c &&
            !c.isExcludedFromBook &&
            !excludedSet.has(c.id) &&
            typeof (c.translatedHtml || c.translatedText) === 'string' &&
            (c.translatedHtml || c.translatedText).trim().length > 0
        );

        const pageChunkCount = validChunks.filter(c => /^(صفحه|page)\s*\d+/i.test((c.chapterTitle || '').trim())).length;
        const isPageBased = pageChunkCount >= Math.min(2, validChunks.length);
        const seenImgs = new Set<string>();

        let currentGroup: { key: string; title: string; chunkHtmls: string[] } | null = null;
        for (const chunk of validChunks) {
          const cleanedTitle = cleanChapterTitle(chunk.chapterTitle || 'فصل کتاب');
          const rawHtml = chunk.translatedHtml || (chunk.translatedText ? `<p>${chunk.translatedText}</p>` : '');
          const sanitized = sanitizeChunkHtml(rawHtml, seenImgs);
          if (!sanitized) continue;

          const isThisChunkPage = /^(صفحه|page)\s*\d+/i.test(cleanedTitle);
          const key = isPageBased
            ? isThisChunkPage
              ? 'continuous_book_stream'
              : cleanedTitle
            : chunk.chapterNumber
            ? `ch_${chunk.chapterNumber}`
            : cleanedTitle;
          const groupTitle = isPageBased && isThisChunkPage ? '' : cleanedTitle;

          if (!currentGroup || currentGroup.key !== key) {
            currentGroup = { key, title: groupTitle, chunkHtmls: [sanitized] };
            chapterSources.push(currentGroup);
          } else {
            currentGroup.chunkHtmls.push(sanitized);
          }
        }
      }
    }

    // 2. Fallback to inline chapters/chunks sent directly in request body (e.g., samples or unsaved admin edits)
    if (chapterSources.length === 0 && Array.isArray(body.chapters) && body.chapters.length > 0) {
      const seenImgs = new Set<string>();
      for (const ch of body.chapters) {
        if (!ch) continue;
        const html = sanitizeChunkHtml(String(ch.htmlContent || ''), seenImgs);
        if (html) {
          chapterSources.push({
            title: cleanChapterTitle(ch.title || ''),
            chunkHtmls: [html],
          });
        }
      }
    }

    if (chapterSources.length === 0) {
      return res.status(400).json({ error: 'محتوای ترجمه‌شده‌ای برای تولید فایل Word وجود ندارد.' });
    }

    const docx = await import('docx');
    const {
      Document,
      Paragraph,
      TextRun,
      HeadingLevel,
      AlignmentType,
      ImageRun,
      BorderStyle,
      Header,
      Footer,
      PageNumber,
      Packer,
    } = docx;

    const design: BookDesignConfig = {
      ...DEFAULT_DESIGN_CONFIG,
      ...incomingDesignConfig,
    };

    const fontFamily = cleanFontFamily(design.fontFamily || 'Vazirmatn');
    const fontDef = createFontDef(fontFamily);

    const activeTheme = BOOK_THEMES[design.themeId] || BOOK_THEMES.spiritual;
    const customColors = design.customColors || {};
    const h1Color = normalizeHex(customColors.heading1Color || activeTheme.headingColor, '1A365D');
    const h2Color = normalizeHex(customColors.heading2Color || activeTheme.accentColor, '2B6CB0');
    const h3Color = normalizeHex(customColors.heading3Color, '2C5282');
    const headerColor = normalizeHex(customColors.headerColor, '718096');
    const footerColor = normalizeHex(customColors.footerColor, '718096');
    const textColor = normalizeHex(customColors.textColor || activeTheme.textColor, '2D3748');
    const accentColor = normalizeHex(customColors.accentColor || activeTheme.accentColor, 'B45309');
    const pageBgColor = normalizeHex(customColors.pageBgColor || activeTheme.pageBgColor, 'FBF6EA');

    const pSpacingAfter =
      design.paragraphSpacing === 'generous'
        ? 420
        : design.paragraphSpacing === 'relaxed'
        ? 340
        : design.paragraphSpacing === 'compact'
        ? 180
        : 260;
    const pSpacingBefore = design.paragraphSpacing === 'generous' ? 120 : 60;
    const pLineSpacing = design.lineSpacing === 'relaxed' ? 440 : design.lineSpacing === 'compact' ? 340 : 380;

    const showHeader = design.showHeader === true && Boolean(design.headerText?.trim());
    const headerText = showHeader ? (design.headerText?.trim() || '') : '';
    const showFooter = design.showFooter === true && Boolean(design.footerText?.trim());
    const footerText = showFooter ? (design.footerText?.trim() || '') : '';
    const showPageNumbers = design.showPageNumbers !== false;

    const h1DocxSize = Math.round((design.heading1Size || 22) * 2);
    const h2DocxSize = Math.round((design.heading2Size || 17) * 2);
    const h3DocxSize = Math.round((design.heading3Size || 14) * 2);
    const bodyDocxSize = design.fontSize === 'small' ? 22 : design.fontSize === 'large' ? 28 : 24;

    const parseHtmlToTextRuns = (html: string, baseColor = textColor, baseSize = bodyDocxSize): any[] => {
      const runs: any[] = [];
      const cleaned = html.replace(/<br\s*[\/]?>/gi, '\n');
      const regex =
        /<b[^>]*>([\s\S]*?)<\/b>|<strong[^>]*>([\s\S]*?)<\/strong>|<i[^>]*>([\s\S]*?)<\/i>|<em[^>]*>([\s\S]*?)<\/em>|([^<]+)/gi;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(cleaned)) !== null) {
        if (match[1] || match[2]) {
          const txt = decodeHtmlEntities((match[1] || match[2]).replace(/<[^>]+>/g, ''));
          if (txt) {
            runs.push(
              new TextRun({
                text: txt,
                font: fontDef,
                size: baseSize,
                bold: true,
                color: baseColor,
                rightToLeft: true,
              })
            );
          }
        } else if (match[3] || match[4]) {
          const txt = decodeHtmlEntities((match[3] || match[4]).replace(/<[^>]+>/g, ''));
          if (txt) {
            runs.push(
              new TextRun({
                text: txt,
                font: fontDef,
                size: baseSize,
                italics: true,
                color: baseColor,
                rightToLeft: true,
              })
            );
          }
        } else if (match[5]) {
          const txt = decodeHtmlEntities(match[5]);
          if (txt) {
            runs.push(
              new TextRun({
                text: txt,
                font: fontDef,
                size: baseSize,
                color: baseColor,
                rightToLeft: true,
              })
            );
          }
        }
      }

      if (runs.length === 0) {
        const plain = decodeHtmlEntities(cleaned.replace(/<[^>]+>/g, '')).trim();
        if (plain) {
          runs.push(
            new TextRun({
              text: plain,
              font: fontDef,
              size: baseSize,
              color: baseColor,
              rightToLeft: true,
            })
          );
        }
      }
      return runs;
    };

    const docChildren: any[] = [];
    const cleanTitle = rawTitle || 'کتاب ترجمه شده';

    // Cover / Title Page (if enabled)
    if (design.showCoverPage !== false) {
      const cover = design.coverPage || {};
      const coverTitle = cover.title?.trim() || cleanTitle;
      const coverTitleSize = Math.round((cover.titleSize || 28) * 2);
      const coverTitleColor = normalizeHex(cover.titleColor, h1Color);
      const coverSubtitle = (cover.subtitle !== undefined ? cover.subtitle : rawOriginalTitle)?.trim() || '';
      const coverSubtitleSize = Math.round((cover.subtitleSize || 14) * 2);
      const coverSubtitleColor = normalizeHex(cover.subtitleColor, '64748B');
      const coverAuthor = (cover.author !== undefined ? cover.author : rawAuthor)?.trim() || '';
      const coverAuthorSize = Math.round((cover.authorSize || 14) * 2);
      const coverAuthorColor = normalizeHex(cover.authorColor, '4A5568');
      const coverTranslator = (cover.translator !== undefined ? cover.translator : rawTranslator)?.trim() || '';
      const coverPublisher = (cover.publisher !== undefined ? cover.publisher : design.brandName)?.trim() || '';
      const coverNote = (cover.note || cover.editionYear || '').trim();
      const coverShowMotif = cover.showMotif !== false;
      const coverShowDivider = cover.showDivider !== false;
      const coverAlign = cover.layout === 'right_aligned' || cover.layout === 'right' ? AlignmentType.RIGHT : AlignmentType.CENTER;

      if (coverShowMotif) {
        docChildren.push(
          new Paragraph({
            alignment: coverAlign,
            spacing: { before: 1400, after: 200 },
            bidirectional: true,
            children: [
              new TextRun({
                text: '✤ ───── ❦ ───── ✤',
                font: fontDef,
                size: 24,
                color: accentColor,
                rightToLeft: true,
              }),
            ],
          })
        );
      }

      docChildren.push(
        new Paragraph({
          alignment: coverAlign,
          spacing: { before: coverShowMotif ? 300 : 1800, after: 300 },
          bidirectional: true,
          children: [
            new TextRun({
              text: coverTitle,
              font: fontDef,
              size: coverTitleSize,
              bold: true,
              color: coverTitleColor,
              rightToLeft: true,
            }),
          ],
        })
      );

      if (coverSubtitle) {
        docChildren.push(
          new Paragraph({
            alignment: coverAlign,
            spacing: { after: 300 },
            bidirectional: true,
            children: [
              new TextRun({
                text: coverSubtitle,
                font: fontDef,
                size: coverSubtitleSize,
                color: coverSubtitleColor,
                rightToLeft: true,
              }),
            ],
          })
        );
      }

      if (coverShowDivider) {
        docChildren.push(
          new Paragraph({
            alignment: coverAlign,
            spacing: { before: 200, after: 400 },
            bidirectional: true,
            children: [
              new TextRun({
                text: '❖',
                font: fontDef,
                size: 22,
                color: accentColor,
                rightToLeft: true,
              }),
            ],
          })
        );
      }

      if (coverAuthor) {
        docChildren.push(
          new Paragraph({
            alignment: coverAlign,
            spacing: { after: 200 },
            bidirectional: true,
            children: [
              new TextRun({
                text: `نویسنده: ${coverAuthor}`,
                font: fontDef,
                size: coverAuthorSize,
                color: coverAuthorColor,
                rightToLeft: true,
              }),
            ],
          })
        );
      }

      if (coverTranslator) {
        docChildren.push(
          new Paragraph({
            alignment: coverAlign,
            spacing: { after: 250 },
            bidirectional: true,
            children: [
              new TextRun({
                text: `ترجمه و ویرایش: ${coverTranslator}`,
                font: fontDef,
                size: 24,
                italics: true,
                color: '718096',
                rightToLeft: true,
              }),
            ],
          })
        );
      }

      if (coverPublisher) {
        docChildren.push(
          new Paragraph({
            alignment: coverAlign,
            spacing: { after: 200 },
            bidirectional: true,
            children: [
              new TextRun({
                text: `انتشارات / ناشر: ${coverPublisher}`,
                font: fontDef,
                size: 22,
                color: '64748B',
                rightToLeft: true,
              }),
            ],
          })
        );
      }

      if (coverNote) {
        docChildren.push(
          new Paragraph({
            alignment: coverAlign,
            spacing: { after: 600 },
            bidirectional: true,
            children: [
              new TextRun({
                text: coverNote,
                font: fontDef,
                size: 20,
                color: '94A3B8',
                italics: true,
                rightToLeft: true,
              }),
            ],
          })
        );
      }

      docChildren.push(new Paragraph({ pageBreakBefore: true, spacing: { before: 300 } }));
    }

    const paraAlignment = design.textAlignment === 'both' ? AlignmentType.BOTH : AlignmentType.RIGHT;
    let processedChunkCounter = 0;

    for (let chIdx = 0; chIdx < chapterSources.length; chIdx++) {
      const ch = chapterSources[chIdx];
      if (chIdx > 0) {
        if (design.continuousFlow === false) {
          docChildren.push(new Paragraph({ pageBreakBefore: true }));
        } else {
          docChildren.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 360, after: 220 },
              bidirectional: true,
              children: [
                new TextRun({
                  text: '✤ ───── ❦ ───── ✤',
                  font: fontDef,
                  size: 20,
                  color: accentColor,
                }),
              ],
            })
          );
        }
      }

      if (ch.title && ch.title.trim()) {
        docChildren.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.RIGHT,
            spacing: { before: 460, after: 280 },
            bidirectional: true,
            children: [
              new TextRun({
                text: ch.title.trim(),
                font: fontDef,
                size: h1DocxSize,
                bold: true,
                color: h1Color,
                rightToLeft: true,
              }),
            ],
          })
        );
      }

      for (const chunkHtml of ch.chunkHtmls) {
        processedChunkCounter++;
        // Cooperative yield every 15 chunks so Node event loop never stalls on 200-500+ page books
        if (processedChunkCounter % 15 === 0) {
          await new Promise<void>(resolve => setImmediate(resolve));
        }

        const blocks = extractHtmlBlocks(chunkHtml);
        for (const blk of blocks) {
          if (blk.kind === 'img' && blk.imageDataUrl) {
            const norm = await normalizeImageBufferForDocx(blk.imageDataUrl);
            if (norm) {
              const size = getProportionalDocxSize(norm.buffer);
              docChildren.push(
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 220, after: 220 },
                  children: [
                    new ImageRun({
                      data: norm.buffer,
                      transformation: size,
                      type: norm.type,
                    } as any),
                  ],
                })
              );
            }
            continue;
          }

          if (blk.kind === 'divider') {
            docChildren.push(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 280, after: 280 },
                bidirectional: true,
                children: [
                  new TextRun({
                    text: '✤ ───── ❦ ───── ✤',
                    font: fontDef,
                    size: 20,
                    color: accentColor,
                  }),
                ],
              })
            );
            continue;
          }

          const innerHtml = blk.innerHtml || '';
          const plain = decodeHtmlEntities(innerHtml.replace(/<[^>]+>/g, '')).trim();
          if (!plain) continue;

          if (blk.kind === 'h1') {
            docChildren.push(
              new Paragraph({
                heading: HeadingLevel.HEADING_1,
                alignment: AlignmentType.RIGHT,
                spacing: { before: 480, after: 260 },
                bidirectional: true,
                children: [
                  new TextRun({
                    text: plain,
                    font: fontDef,
                    size: h1DocxSize,
                    bold: true,
                    color: h1Color,
                    rightToLeft: true,
                  }),
                ],
              })
            );
          } else if (blk.kind === 'h2') {
            docChildren.push(
              new Paragraph({
                heading: HeadingLevel.HEADING_2,
                alignment: AlignmentType.RIGHT,
                spacing: { before: 380, after: 180 },
                bidirectional: true,
                children: [
                  new TextRun({
                    text: plain,
                    font: fontDef,
                    size: h2DocxSize,
                    bold: true,
                    color: h2Color,
                    rightToLeft: true,
                  }),
                ],
              })
            );
          } else if (blk.kind === 'h3') {
            docChildren.push(
              new Paragraph({
                heading: HeadingLevel.HEADING_3,
                alignment: AlignmentType.RIGHT,
                spacing: { before: 280, after: 140 },
                bidirectional: true,
                children: [
                  new TextRun({
                    text: plain,
                    font: fontDef,
                    size: h3DocxSize,
                    bold: true,
                    color: h3Color,
                    rightToLeft: true,
                  }),
                ],
              })
            );
          } else if (blk.kind === 'blockquote') {
            docChildren.push(
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { before: 220, after: 220 },
                indent: { right: 640 },
                bidirectional: true,
                border: {
                  right: { color: h2Color, size: 24, style: BorderStyle.SINGLE },
                },
                children: [
                  new TextRun({
                    text: '« ',
                    font: fontDef,
                    size: 22,
                    color: h2Color,
                    rightToLeft: true,
                  }),
                  ...parseHtmlToTextRuns(innerHtml, textColor, bodyDocxSize),
                  new TextRun({
                    text: ' »',
                    font: fontDef,
                    size: 22,
                    color: h2Color,
                    rightToLeft: true,
                  }),
                ],
              })
            );
          } else if (blk.kind === 'footnote') {
            docChildren.push(
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { before: 140, after: 140, line: 340 },
                bidirectional: true,
                border: {
                  top: { color: 'CBD5E1', size: 6, style: BorderStyle.DASHED },
                },
                children: parseHtmlToTextRuns(innerHtml, '475569', 20),
              })
            );
          } else {
            const runs = parseHtmlToTextRuns(innerHtml, textColor, bodyDocxSize);
            if (runs.length > 0) {
              docChildren.push(
                new Paragraph({
                  alignment: paraAlignment,
                  spacing: { line: pLineSpacing, before: pSpacingBefore, after: pSpacingAfter },
                  bidirectional: true,
                  children: runs,
                })
              );
            }
          }
        }
      }
    }

    const marginTwips = design.pageMargin === 'compact' ? 1080 : design.pageMargin === 'generous' ? 1800 : 1440;

    const doc = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: fontDef,
              rightToLeft: true,
              size: bodyDocxSize,
              color: textColor,
            },
            paragraph: {
              alignment: paraAlignment,
              spacing: { line: pLineSpacing, after: pSpacingAfter },
            },
          },
        },
      },
      background: {
        color: pageBgColor,
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: marginTwips,
                bottom: marginTwips,
                left: marginTwips,
                right: marginTwips,
              },
            },
          },
          headers:
            showHeader && headerText
              ? {
                  default: new Header({
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        bidirectional: true,
                        children: [
                          new TextRun({
                            text: headerText,
                            font: fontDef,
                            size: 18,
                            color: headerColor,
                            rightToLeft: true,
                          }),
                        ],
                      }),
                    ],
                  }),
                }
              : undefined,
          footers:
            showFooter || showPageNumbers
              ? {
                  default: new Footer({
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        bidirectional: true,
                        children: [
                          ...(footerText
                            ? [
                                new TextRun({
                                  text: showPageNumbers ? `${footerText} • صفحه ` : footerText,
                                  font: fontDef,
                                  size: 18,
                                  color: footerColor,
                                  rightToLeft: true,
                                }),
                              ]
                            : showPageNumbers
                            ? [
                                new TextRun({
                                  text: 'صفحه ',
                                  font: fontDef,
                                  size: 18,
                                  color: footerColor,
                                  rightToLeft: true,
                                }),
                              ]
                            : []),
                          ...(showPageNumbers
                            ? [
                                new TextRun({
                                  children: [PageNumber.CURRENT],
                                  font: fontDef,
                                  size: 18,
                                  color: footerColor,
                                  rightToLeft: true,
                                }),
                              ]
                            : []),
                        ],
                      }),
                    ],
                  }),
                }
              : undefined,
          children: docChildren,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    const safeAsciiName = `book-${(bookId || 'export').replace(/[^a-zA-Z0-9_-]/g, '')}.docx`;
    const utf8FileName = encodeURIComponent(`${cleanTitle}.docx`);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safeAsciiName}"; filename*=UTF-8''${utf8FileName}`);
    res.setHeader('Content-Length', String(buffer.length));
    return res.send(buffer);
  } catch (err: any) {
    console.error('[Export Docx Server Error]:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: err?.message || 'خطا در ساخت فایل Word در سرور' });
    }
  }
}
