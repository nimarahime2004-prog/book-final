import React, { useEffect, useMemo } from 'react';
import { BookProject } from '../types.ts';
import { BOOK_THEMES, DEFAULT_DESIGN_CONFIG } from '../constants/themes.ts';
import { groupChunksIntoChapters, type GroupedChapter } from '../utils/exporter.ts';

interface PrintDocumentProps {
  project: BookProject;
  preparedChapters?: GroupedChapter[] | null;
  pageRange?: { start?: number; end?: number };
}

function escapeCssContent(value: string): string {
  return (value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ').trim();
}

export const PrintDocument: React.FC<PrintDocumentProps> = ({
  project,
  preparedChapters,
  pageRange,
}) => {
  const design = project?.designConfig || DEFAULT_DESIGN_CONFIG;

  const chapters = useMemo(() => {
    if (Array.isArray(preparedChapters) && preparedChapters.length > 0) {
      return preparedChapters;
    }
    if (!project || !Array.isArray(project.chunks) || project.chunks.length === 0) {
      return [];
    }
    return groupChunksIntoChapters(project.chunks, design.excludedChunkIds, pageRange);
  }, [preparedChapters, project, design.excludedChunkIds, pageRange]);

  const defaultThemeFallback = BOOK_THEMES.spiritual || {
    id: 'spiritual',
    name: 'معنوی و عرفانی',
    enName: 'Persian Illumination & Gold',
    category: 'معنوی و عرفانی',
    description: '',
    previewBg: 'bg-[#fbf6ea]',
    bgClass: 'bg-[#fbf6ea] text-[#241c14]',
    pageBgColor: '#fbf6ea',
    textColor: '#241c14',
    headingColor: '#1e3a8a',
    accentColor: '#b45309',
    borderColor: '#d4af37',
    dividerSymbol: '❦ ✤ ❦',
    borderStyle: 'border-2 border-double border-[#d4af37]',
    tagline: '',
  };

  const theme = (design?.themeId && BOOK_THEMES[design.themeId]) || defaultThemeFallback;
  const customColors = design.customColors || {};

  const pageBgColor = customColors.pageBgColor || theme?.pageBgColor || '#ffffff';
  const textColor = customColors.textColor || theme?.textColor || '#1e293b';
  const heading1Color = customColors.heading1Color || theme?.headingColor || '#1a365d';
  const heading2Color = customColors.heading2Color || theme?.accentColor || '#2b6cb0';
  const heading3Color = customColors.heading3Color || '#2c5282';
  const headerColor = customColors.headerColor || theme?.headingColor || '#718096';
  const footerColor = customColors.footerColor || textColor || '#718096';
  const borderColor = customColors.borderColor || theme?.borderColor || '#e2e8f0';
  const accentColor = customColors.accentColor || theme?.accentColor || '#b45309';

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--print-page-bg', pageBgColor);
      document.body.style.setProperty('--print-page-bg', pageBgColor);
      return () => {
        document.documentElement.style.removeProperty('--print-page-bg');
        document.body.style.removeProperty('--print-page-bg');
      };
    }
  }, [pageBgColor]);

  if (!project || chapters.length === 0) {
    return null;
  }

  const fontSizeClass =
    design.fontSize === 'small'
      ? 'text-[11pt]'
      : design.fontSize === 'large'
      ? 'text-[14pt]'
      : 'text-[12pt]';

  const lineSpacingStyle =
    design.lineSpacing === 'compact'
      ? '1.65'
      : design.lineSpacing === 'relaxed'
      ? '2.25'
      : '1.95';

  const fontFamily = design.fontFamily || 'Vazirmatn Medium';

  // Strictly respect empty header/footer — never inject unsolicited domain or platform names
  const rawHeaderParts = [design.headerText?.trim(), design.websiteUrl?.trim()].filter(Boolean) as string[];
  const showRunningHeader = design.showHeader === true && rawHeaderParts.length > 0;
  const showPageNumbers = design.showPageNumbers !== false;
  const rawFooterParts = [design.footerText?.trim(), design.brandName?.trim()].filter(Boolean) as string[];
  const hasFooterText = design.showFooter === true && rawFooterParts.length > 0;
  const showRunningFooter = hasFooterText || showPageNumbers;

  const topMarginMm =
    design.topMargin === 'compact'
      ? 12
      : design.topMargin === 'generous'
      ? 22
      : design.topMargin === 'extra_generous'
      ? 28
      : 16;

  const bottomMarginMm = showRunningFooter ? 17 : 14;

  const horizontalMarginMm =
    design.pageMargin === 'compact'
      ? 16
      : design.pageMargin === 'generous'
      ? 28
      : 22;

  const horizontalPaddingStyle = `${horizontalMarginMm}mm`;
  const paragraphSpacingClass = `p-spacing-${design.paragraphSpacing || 'normal'}`;
  const isJustified = design.textAlignment === 'both';
  const textAlignClass = isJustified ? 'text-justify book-align-both' : 'text-right book-align-right';

  const totalSectionsCount = chapters.reduce(
    (sum, ch) => sum + (Array.isArray(ch.sections) && ch.sections.length > 0 ? ch.sections.length : 1),
    0
  );
  const isLargeBook = totalSectionsCount > 80;

  const headerLabel = showRunningHeader ? escapeCssContent(rawHeaderParts.join(' • ')) : '';
  const footerLabel = hasFooterText ? escapeCssContent(rawFooterParts.join(' • ')) : '';

  const dynamicPageCss = `
    @page {
      size: A4 portrait;
      margin: ${topMarginMm}mm 0mm ${bottomMarginMm}mm 0mm !important;
      background: ${pageBgColor};
      @top-left {
        ${showRunningHeader && headerLabel ? `content: ""; width: ${horizontalMarginMm}mm;` : 'content: none !important;'}
      }
      @top-right {
        ${showRunningHeader && headerLabel ? `content: ""; width: ${horizontalMarginMm}mm;` : 'content: none !important;'}
      }
      @top-center {
        ${
          showRunningHeader && headerLabel
            ? `content: "${headerLabel}"; width: 100%; font-family: '${fontFamily}', 'Vazirmatn', Tahoma, sans-serif; font-size: 8.5pt; color: ${headerColor}; vertical-align: bottom; padding-bottom: 2.5mm; margin-bottom: 1.5mm; border-bottom: 0.75pt solid ${borderColor};`
            : 'content: none !important; border: none !important;'
        }
      }
      @bottom-left {
        ${showRunningFooter ? `content: ""; width: ${horizontalMarginMm}mm;` : 'content: none !important;'}
      }
      @bottom-right {
        ${showRunningFooter ? `content: ""; width: ${horizontalMarginMm}mm;` : 'content: none !important;'}
      }
      @bottom-center {
        ${
          hasFooterText && showPageNumbers
            ? `content: "${footerLabel}  •  صفحه " counter(page); width: 100%; font-family: '${fontFamily}', 'Vazirmatn', Tahoma, sans-serif; font-size: 8.5pt; color: ${footerColor}; vertical-align: top; padding-top: 2.5mm; margin-top: 1.5mm; border-top: 0.75pt solid ${borderColor};`
            : hasFooterText
            ? `content: "${footerLabel}"; width: 100%; font-family: '${fontFamily}', 'Vazirmatn', Tahoma, sans-serif; font-size: 8.5pt; color: ${footerColor}; vertical-align: top; padding-top: 2.5mm; margin-top: 1.5mm; border-top: 0.75pt solid ${borderColor};`
            : showPageNumbers
            ? `content: "صفحه " counter(page); width: 100%; font-family: '${fontFamily}', 'Vazirmatn', Tahoma, sans-serif; font-size: 8.5pt; color: ${footerColor}; vertical-align: top; padding-top: 2.5mm; margin-top: 1.5mm; border-top: 0.75pt solid ${borderColor};`
            : 'content: none !important; border: none !important;'
        }
      }
    }
    @page :first {
      margin-top: 10mm !important;
      @top-left { content: none !important; border: none !important; }
      @top-center { content: none !important; border: none !important; }
      @top-right { content: none !important; border: none !important; }
      @bottom-left { content: none !important; border: none !important; }
      @bottom-center { content: none !important; border: none !important; }
      @bottom-right { content: none !important; border: none !important; }
    }
  `;

  return (
    <div
      className="print-only hidden min-h-screen text-right relative print-doc-root"
      style={{
        backgroundColor: pageBgColor,
        color: textColor,
        fontFamily: `'${fontFamily}', 'Vazirmatn', 'B Nazanin', 'Tahoma', sans-serif`,
        direction: 'rtl',
        ['--theme-h1-color' as any]: heading1Color,
        ['--theme-h2-color' as any]: heading2Color,
        ['--theme-h3-color' as any]: heading3Color,
        ['--theme-h1-size' as any]: `${design.heading1Size || 22}pt`,
        ['--theme-h2-size' as any]: `${design.heading2Size || 16.5}pt`,
        ['--theme-h3-size' as any]: `${design.heading3Size || 13.5}pt`,
        ['--theme-text-color' as any]: textColor,
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: dynamicPageCss }} />

      {/* Optional Watermark Text (disabled on huge >120-section books to avoid Skia layer OOM) */}
      {design.watermarkText?.trim() && totalSectionsCount <= 120 && (
        <div className="fixed inset-0 pointer-events-none flex items-center justify-center select-none z-0 overflow-hidden opacity-[0.06]">
          <div
            className="transform -rotate-45 text-5xl sm:text-7xl font-bold tracking-widest whitespace-nowrap"
            style={{ color: theme.headingColor }}
          >
            {design.watermarkText}
          </div>
        </div>
      )}

      {/* Subtle SVG Patterns (only for normal-sized books; skipped on large >80-section books to prevent Chromium print hang) */}
      {!isLargeBook && design.backgroundPattern === 'arabesque' && (
        <div className="fixed inset-0 pointer-events-none opacity-[0.04] z-0 flex items-center justify-center">
          <svg width="600" height="600" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="0.5">
            <circle cx="50" cy="50" r="45" />
            <circle cx="50" cy="50" r="35" strokeDasharray="2 2" />
            <circle cx="50" cy="50" r="25" />
            <polygon points="50,5 63,38 95,50 63,62 50,95 37,62 5,50 37,38" />
            <polygon points="50,15 60,40 85,50 60,60 50,85 40,60 15,50 40,40" strokeDasharray="1 1" />
          </svg>
        </div>
      )}

      {!isLargeBook && design.backgroundPattern === 'geometry' && (
        <div className="fixed inset-0 pointer-events-none opacity-[0.04] z-0 flex items-center justify-center">
          <svg width="600" height="600" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="0.4">
            <rect x="15" y="15" width="70" height="70" transform="rotate(45 50 50)" />
            <rect x="15" y="15" width="70" height="70" />
            <circle cx="50" cy="50" r="35" />
            <circle cx="50" cy="50" r="20" strokeDasharray="1 1" />
          </svg>
        </div>
      )}

      {/* Block-level flow container (avoids monolithic <table> LayoutNG freeze on 100-500+ page books) */}
      <div
        className="book-page-content-wrapper"
        style={{
          paddingLeft: horizontalPaddingStyle,
          paddingRight: horizontalPaddingStyle,
          paddingTop: '2mm',
          paddingBottom: '6mm',
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
          direction: 'rtl',
        }}
      >
        {/* Cover Page / Title Page */}
        {design.showCoverPage !== false &&
          (() => {
            const cover = design.coverPage || {};
            const coverLayout = cover.layout || 'center';
            const isRightAlign = coverLayout === 'right' || coverLayout === 'right_aligned';
            const isFramed = coverLayout === 'frame' || coverLayout === 'framed_spiritual';

            const coverTitle = cover.title?.trim() || project.title?.trim() || project.originalTitle?.trim() || 'کتاب بدون عنوان';
            const rawOrig = project.originalTitle?.trim() || '';
            const cleanOrig =
              rawOrig && rawOrig !== coverTitle && rawOrig !== 'Untitled Book' && rawOrig !== 'New Book' ? rawOrig : '';
            const coverSubtitle = cover.subtitle?.trim() || cleanOrig;
            const rawAuthor = project.author?.trim() || '';
            const cleanAuthor = rawAuthor && rawAuthor !== 'نامشخص' ? rawAuthor : '';
            const coverAuthor = cover.author?.trim() || cleanAuthor;
            const rawTrans = project.translator?.trim() || '';
            const cleanTrans =
              rawTrans && rawTrans !== 'سامانه هوشمند ترجمه کتاب' && rawTrans !== 'سامانه ترجمه' ? rawTrans : '';
            const coverTranslator = cover.translator?.trim() || cleanTrans;
            const coverPublisher = cover.publisher?.trim() || design.brandName?.trim() || '';
            const coverNote = cover.note || cover.editionYear;

            const titleSizePt = cover.titleSize || 32;
            const subtitleSizePt = cover.subtitleSize || 16;
            const authorSizePt = cover.authorSize || 13;

            const titleColor = cover.titleColor || heading1Color || theme.headingColor;
            const subtitleColor = cover.subtitleColor || theme.accentColor || '#b45309';
            const authorColor = cover.authorColor || textColor;
            const showMotif = cover.showMotif ?? true;
            const showDivider = cover.showDivider ?? true;

            return (
              <div
                className={`book-cover-page min-h-[85vh] flex flex-col py-16 my-auto ${
                  isRightAlign ? 'items-start text-right' : 'items-center justify-center text-center'
                } ${isFramed ? 'p-10 border-4 border-double rounded-3xl m-4' : ''}`}
                style={{
                  backgroundColor: cover.bgColor || undefined,
                  borderColor: cover.borderColor || borderColor,
                  pageBreakAfter: 'always',
                  breakAfter: 'page',
                }}
              >
                {showMotif && (
                  <div
                    className="text-3xl font-serif mb-6 opacity-85 select-none"
                    style={{ color: accentColor }}
                  >
                    {theme.dividerSymbol || '❦ ✤ ❦'}
                  </div>
                )}

                <h1
                  className="font-extrabold mb-3 tracking-tight leading-snug max-w-3xl"
                  style={{
                    fontSize: `${titleSizePt}pt`,
                    color: titleColor,
                    textAlign: isRightAlign ? 'right' : 'center',
                  }}
                >
                  {coverTitle}
                </h1>

                {coverSubtitle && (
                  <h2
                    className="font-normal opacity-80 mb-5 font-serif"
                    dir="auto"
                    style={{
                      fontSize: `${subtitleSizePt}pt`,
                      color: subtitleColor,
                      textAlign: isRightAlign ? 'right' : 'center',
                    }}
                  >
                    {coverSubtitle}
                  </h2>
                )}

                {showDivider && (
                  <div
                    className={`h-1.5 rounded-full my-6 opacity-80 ${isRightAlign ? 'w-48 ml-auto mr-0' : 'w-36 mx-auto'}`}
                    style={{ backgroundColor: accentColor }}
                  />
                )}

                <div
                  className="space-y-3 font-medium opacity-90 my-8 leading-relaxed"
                  style={{
                    fontSize: `${authorSizePt}pt`,
                    color: authorColor,
                    textAlign: isRightAlign ? 'right' : 'center',
                  }}
                >
                  {coverAuthor && (
                    <p>
                      نویسنده: <strong style={{ color: titleColor }}>{coverAuthor}</strong>
                    </p>
                  )}
                  {coverTranslator && (
                    <p>
                      ترجمه و ویرایش: <strong>{coverTranslator}</strong>
                    </p>
                  )}
                  {coverPublisher && (
                    <p className="opacity-85 pt-1">
                      انتشارات / ناشر: <strong>{coverPublisher}</strong>
                    </p>
                  )}
                  {design.websiteUrl && (
                    <p className="opacity-80 font-mono tracking-wider pt-0.5 text-[10pt]" dir="ltr">
                      {design.websiteUrl}
                    </p>
                  )}
                  {coverNote && (
                    <p className="text-[10pt] opacity-75 pt-2 border-t border-slate-300/40 max-w-md mx-auto">
                      {coverNote}
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

        {/* Chapters & Incremental Chunk Sections (zero mega-string innerHTML nodes) */}
        <div className="space-y-8">
          {chapters.map((chapter, idx, allChapters) => {
            const sections =
              Array.isArray(chapter.sections) && chapter.sections.length > 0
                ? chapter.sections
                : chapter.htmlContent
                ? [{ id: chapter.chapterKey, html: chapter.htmlContent }]
                : [];

            return (
              <div
                key={`${chapter.chapterKey}_${idx}`}
                className={`book-chapter-break ${design.continuousFlow === false && idx > 0 ? 'force-page-break' : ''} pt-4 ${
                  design.borderStyle === 'ornate_spiritual'
                    ? 'p-6 rounded-2xl border-2 border-double my-4'
                    : design.borderStyle === 'double_classic'
                    ? 'p-6 rounded-xl border-4 border-double my-4'
                    : design.borderStyle === 'thin_modern'
                    ? 'p-6 rounded-xl border my-4'
                    : ''
                }`}
                style={{
                  lineHeight: lineSpacingStyle,
                  borderColor,
                }}
              >
                <div
                  className={`book-render-content ${fontSizeClass} ${paragraphSpacingClass} ${textAlignClass}`}
                  style={{
                    lineHeight: lineSpacingStyle,
                    textAlign: isJustified ? 'justify' : 'right',
                  }}
                >
                  {sections.map(sec => (
                    <div
                      key={sec.id}
                      className="book-render-section"
                      dangerouslySetInnerHTML={{ __html: sec.html }}
                    />
                  ))}
                </div>

                {idx < allChapters.length - 1 && (
                  <div
                    className="text-center my-8 text-sm opacity-60"
                    style={{ color: accentColor }}
                  >
                    {theme.dividerSymbol}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
