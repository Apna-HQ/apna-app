import { NextResponse } from 'next/server';
import sharp from 'sharp';

import { getFaviconUrl } from '@/lib/utils';

const DEFAULT_ICON_PATH = '/icon-192x192.png';
const ICON_CACHE_CONTROL = 'public, max-age=3600';
const FETCH_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,image/avif,image/webp,image/png,image/svg+xml,image/*,*/*;q=0.8',
  'User-Agent': 'Mozilla/5.0 (compatible; ApnaIconFetcher/1.0)',
};

type FaviconCandidate = {
  url: string;
  rel: string;
  type?: string;
  sizes?: string;
  score: number;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const appUrl = normalizeHttpUrl(searchParams.get('appUrl'));

    if (!appUrl) {
      return new NextResponse('Missing or invalid appUrl parameter', { status: 400 });
    }

    const candidates = await getIconCandidates(appUrl);

    for (const candidate of candidates) {
      try {
        return await iconResponseFromCandidate(candidate);
      } catch (error) {
        console.warn('[favicon] Candidate failed:', candidate.url, error);
      }
    }

    return await defaultIconResponse(request.url);
  } catch (error) {
    console.error('[favicon] Fetch/parse error:', error);
    return defaultIconResponse(request.url);
  }
}

function normalizeHttpUrl(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function getIconCandidates(appUrl: string): Promise<FaviconCandidate[]> {
  const candidates: FaviconCandidate[] = [];

  try {
    const pageResponse = await fetch(appUrl, {
      headers: FETCH_HEADERS,
      redirect: 'follow',
    });

    if (pageResponse.ok) {
      const contentType = pageResponse.headers.get('content-type')?.toLowerCase() ?? '';
      if (!contentType || contentType.includes('html') || contentType.includes('xml')) {
        const html = await pageResponse.text();
        candidates.push(...extractIconCandidates(html, appUrl));
      }
    }
  } catch (error) {
    console.warn('[favicon] Failed to inspect page:', appUrl, error);
  }

  const fallbackUrl = getFaviconUrl(appUrl);
  if (fallbackUrl) {
    candidates.push({
      url: fallbackUrl,
      rel: 'fallback icon',
      score: 0,
    });
  }

  return dedupeCandidates(candidates).sort((a, b) => b.score - a.score);
}

function extractIconCandidates(html: string, appUrl: string): FaviconCandidate[] {
  const candidates: FaviconCandidate[] = [];
  const linkTagRegex = /<link\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkTagRegex.exec(html))) {
    const attrs = parseHtmlAttributes(match[0]);
    const href = attrs.href?.trim();
    const rel = attrs.rel?.trim().toLowerCase() ?? '';
    const relTokens = rel.split(/\s+/).filter(Boolean);

    if (!href || !isIconRel(relTokens)) continue;

    const iconUrl = resolveIconHref(href, appUrl);
    if (!iconUrl) continue;

    candidates.push({
      url: iconUrl,
      rel,
      type: attrs.type,
      sizes: attrs.sizes,
      score: scoreIconCandidate(iconUrl, relTokens, attrs.type, attrs.sizes),
    });
  }

  return candidates;
}

function parseHtmlAttributes(tag: string) {
  const attrs: Record<string, string> = {};
  const attrRegex = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(tag))) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }

  return attrs;
}

function isIconRel(relTokens: string[]) {
  return relTokens.some((token) => (
    token === 'icon' ||
    token === 'apple-touch-icon' ||
    token === 'apple-touch-icon-precomposed' ||
    token === 'mask-icon'
  ));
}

function resolveIconHref(href: string, appUrl: string) {
  if (/^data:image\//i.test(href)) return href;

  try {
    const url = new URL(href, appUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function scoreIconCandidate(
  iconUrl: string,
  relTokens: string[],
  declaredType?: string,
  sizes?: string
) {
  const type = declaredType?.toLowerCase() ?? '';
  const lowerUrl = iconUrl.toLowerCase();
  let score = 0;

  if (relTokens.includes('apple-touch-icon') || relTokens.includes('apple-touch-icon-precomposed')) {
    score += 60;
  }
  if (relTokens.includes('icon')) score += 50;
  if (relTokens.includes('mask-icon')) score += 20;

  if (lowerUrl.startsWith('data:image/')) score += 30;
  if (type.includes('png') || type.includes('webp') || type.includes('jpeg') || type.includes('jpg')) {
    score += 35;
  } else if (type.includes('svg')) {
    score += 25;
  } else if (type.includes('icon') || type.includes('ico')) {
    score -= 10;
  }

  if (/\.(png|webp|jpe?g)(?:[?#]|$)/i.test(lowerUrl)) score += 25;
  if (/\.svg(?:[?#]|$)/i.test(lowerUrl)) score += 15;
  if (/\.ico(?:[?#]|$)/i.test(lowerUrl)) score -= 10;

  score += sizeScore(sizes);
  return score;
}

function sizeScore(sizes?: string) {
  if (!sizes) return 0;
  if (sizes.toLowerCase() === 'any') return 32;

  const sizeRegex = /(\d+)\s*x\s*(\d+)/gi;
  let best = 0;
  let match: RegExpExecArray | null;

  while ((match = sizeRegex.exec(sizes))) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    best = Math.max(best, Math.min(width, height));
  }

  return Math.min(Math.round(best / 4), 48);
}

function dedupeCandidates(candidates: FaviconCandidate[]) {
  const byUrl = new Map<string, FaviconCandidate>();

  candidates.forEach((candidate) => {
    const existing = byUrl.get(candidate.url);
    if (!existing || candidate.score > existing.score) {
      byUrl.set(candidate.url, candidate);
    }
  });

  return Array.from(byUrl.values());
}

async function iconResponseFromCandidate(candidate: FaviconCandidate) {
  if (candidate.url.startsWith('data:image/')) {
    return iconResponseFromDataUri(candidate.url);
  }

  const response = await fetch(candidate.url, {
    headers: FETCH_HEADERS,
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch favicon: ${response.status} ${response.statusText}`);
  }

  const declaredType = response.headers.get('content-type')?.toLowerCase().split(';')[0].trim() ?? '';
  if (declaredType.includes('html')) {
    throw new Error(`Favicon response was HTML (${declaredType})`);
  }

  const contentType = declaredType || contentTypeFromUrl(candidate.url);
  if (!isImageContentType(contentType)) {
    throw new Error(`Favicon response was not an image (${contentType || 'unknown content type'})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return iconResponseFromBuffer(buffer, contentType, candidate.url);
}

function iconResponseFromDataUri(uri: string) {
  const match = uri.match(/^data:([^;,]+)(;base64)?,(.*)$/i);
  if (!match) {
    throw new Error('Invalid data URI favicon');
  }

  const contentType = match[1].toLowerCase();
  if (!isImageContentType(contentType)) {
    throw new Error(`Data URI was not an image (${contentType})`);
  }

  const buffer = match[2]
    ? Buffer.from(match[3], 'base64')
    : Buffer.from(decodeURIComponent(match[3]));

  return iconResponseFromBuffer(buffer, contentType, uri);
}

async function iconResponseFromBuffer(buffer: Buffer, contentType: string, sourceUrl: string) {
  if (contentType.includes('svg') || /\.svg(?:[?#]|$)/i.test(sourceUrl)) {
    return imageResponse(buffer, 'image/svg+xml');
  }

  if (isIconContentType(contentType) || /\.ico(?:[?#]|$)/i.test(sourceUrl)) {
    return imageResponse(buffer, 'image/x-icon');
  }

  try {
    const imageBuffer = await sharp(buffer)
      .resize(192, 192, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      })
      .png()
      .toBuffer();

    return imageResponse(imageBuffer, 'image/png');
  } catch (error) {
    console.warn('[favicon] Image resize failed; returning original image:', sourceUrl, error);
    return imageResponse(buffer, contentType);
  }
}

function isImageContentType(contentType: string) {
  return contentType.startsWith('image/');
}

function isIconContentType(contentType: string) {
  return (
    contentType.includes('x-icon') ||
    contentType.includes('vnd.microsoft.icon') ||
    contentType.includes('image/ico')
  );
}

function contentTypeFromUrl(url: string) {
  const lowerUrl = url.toLowerCase();
  if (/\.svg(?:[?#]|$)/.test(lowerUrl)) return 'image/svg+xml';
  if (/\.png(?:[?#]|$)/.test(lowerUrl)) return 'image/png';
  if (/\.webp(?:[?#]|$)/.test(lowerUrl)) return 'image/webp';
  if (/\.jpe?g(?:[?#]|$)/.test(lowerUrl)) return 'image/jpeg';
  if (/\.gif(?:[?#]|$)/.test(lowerUrl)) return 'image/gif';
  if (/\.ico(?:[?#]|$)/.test(lowerUrl)) return 'image/x-icon';
  return '';
}

function imageResponse(buffer: Buffer, contentType: string) {
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': ICON_CACHE_CONTROL,
    },
  });
}

async function defaultIconResponse(requestUrl: string) {
  try {
    const defaultIconResponse = await fetch(new URL(DEFAULT_ICON_PATH, requestUrl).toString());
    const defaultIconBuffer = Buffer.from(await defaultIconResponse.arrayBuffer());
    const defaultImageBuffer = await sharp(defaultIconBuffer)
      .resize(192, 192)
      .png()
      .toBuffer();

    return imageResponse(defaultImageBuffer, 'image/png');
  } catch (error) {
    console.error('[favicon] Failed to process default icon:', error);
    return NextResponse.json({ error: 'Failed to fetch or parse favicon' }, { status: 500 });
  }
}
