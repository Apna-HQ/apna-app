/**
 * app/api/build/scaffold/route.ts
 *
 * Serves a chosen starter template as a ZIP download or a plain-text copyable
 * snippet (for guide templates).
 *
 * GET /api/build/scaffold?template=<id>
 *   Returns the template as application/zip (binary download) for downloadable
 *   starters, or text/plain for guide templates.
 *
 * Query params:
 *   template   — TemplateId: 'react-vite' | 'single-html' | 'make-compatible'
 *   format     — 'zip' (default) | 'snippet' (returns first copyable file as text)
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getTemplate, TemplateId } from '@/lib/build/templates/index';
import { buildZip } from '@/lib/build/zip';

/** Recursively collect all files under `dir`, returning { name, data } pairs. */
function collectFiles(
  dir: string,
  prefix: string,
): { name: string; data: Buffer }[] {
  const results: { name: string; data: Buffer }[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relName = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, relName));
    } else {
      results.push({ name: relName, data: fs.readFileSync(fullPath) });
    }
  }
  return results;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const templateId = searchParams.get('template') as TemplateId | null;
  const format = searchParams.get('format') ?? 'zip';

  if (!templateId) {
    return NextResponse.json(
      { error: 'Missing required query param: template' },
      { status: 400 },
    );
  }

  const meta = getTemplate(templateId);
  if (!meta) {
    return NextResponse.json(
      { error: `Unknown template: ${templateId}` },
      { status: 404 },
    );
  }

  // Templates live at lib/build/templates/<id>/
  const templateDir = path.join(
    process.cwd(),
    'lib',
    'build',
    'templates',
    meta.dir,
  );

  if (!fs.existsSync(templateDir)) {
    return NextResponse.json(
      { error: `Template directory not found: ${meta.dir}` },
      { status: 500 },
    );
  }

  // Guide templates: return the README as a plain-text snippet.
  if (meta.isGuide || format === 'snippet') {
    const readmePath = path.join(templateDir, 'README.md');
    if (!fs.existsSync(readmePath)) {
      return NextResponse.json({ error: 'README not found' }, { status: 500 });
    }
    const text = fs.readFileSync(readmePath, 'utf8');
    return new NextResponse(text, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  // Downloadable templates: build a ZIP.
  try {
    const files = collectFiles(templateDir, meta.id);
    const zipBuffer = buildZip(files);

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${meta.id}-starter.zip"`,
        'Content-Length': String(zipBuffer.length),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    console.error('[scaffold] zip error', err);
    return NextResponse.json(
      { error: 'Failed to build zip archive' },
      { status: 500 },
    );
  }
}
