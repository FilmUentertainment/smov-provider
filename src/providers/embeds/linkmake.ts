/* eslint-disable no-console */
import { load } from 'cheerio';

import { flags } from '@/entrypoint/utils/targets';
import { makeEmbed } from '@/providers/base';
import { NotFoundError } from '@/utils/errors';

// Helper function to check if a URL is safe (not javascript protocol)
function isValidUrl(url?: string): boolean {
  if (!url) return false;
  // Check if the URL contains hash or starts with javascript protocol using regex
  return !url.includes('#') && !/^javascript:/i.test(url);
}

export const linkmakeScraper = makeEmbed({
  id: 'linkmake',
  name: 'LinkMake',
  rank: 145,
  async scrape(ctx) {
    console.log('🔗 LinkMake: Starting scraper with URL:', ctx.url);
    ctx.progress(10);

    // Fetch the linkmake page
    try {
      const linkmakePage = await ctx.proxiedFetcher(ctx.url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          Referer: new URL(ctx.url).origin,
        },
      });
      console.log('🔗 LinkMake: Page fetched, length:', linkmakePage.length);
      ctx.progress(30);

      // Parse the page to find the next redirect or download links
      const $ = load(linkmakePage);
      const streamLinks: { quality?: string; url: string }[] = [];

      // Check for download buttons with different qualities
      console.log('🔗 LinkMake: Looking for download buttons');
      $('.button, .dlbutton, .download, a[href*="download"]').each((i, el) => {
        const link = $(el).attr('href');
        const text = $(el).text().trim();
        console.log(`🔗 LinkMake: Button #${i + 1}: "${text}" - ${link}`);

        if (isValidUrl(link)) {
          const qualityMatch = text.match(/(\d+)p/i);
          const quality = qualityMatch ? qualityMatch[1] : undefined;

          // Since we've already checked link is valid with isValidUrl, we know it's defined
          const safeLink = link as string;

          if (quality) {
            console.log(`🔗 LinkMake: Found quality link: ${quality}p - ${safeLink}`);
            streamLinks.push({
              quality,
              url: safeLink.startsWith('http') ? safeLink : new URL(safeLink, ctx.url).href,
            });
          } else {
            console.log(`🔗 LinkMake: Found direct link: ${safeLink}`);
            streamLinks.push({
              url: safeLink.startsWith('http') ? safeLink : new URL(safeLink, ctx.url).href,
            });
          }
        }
      });

      // If no direct download links, check for iframe sources or redirects
      if (streamLinks.length === 0) {
        console.log('🔗 LinkMake: Looking for iframes or redirects');

        // Check for iframes
        $('iframe').each((i, el) => {
          const src = $(el).attr('src');
          if (src) {
            console.log(`🔗 LinkMake: Found iframe: ${src}`);
            streamLinks.push({
              url: src.startsWith('http') ? src : new URL(src, ctx.url).href,
            });
          }
        });

        // Check for meta refresh redirects
        const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
        if (metaRefresh) {
          const urlMatch = metaRefresh.match(/URL=(['"]?)([^'"]+)\1/i);
          if (urlMatch && urlMatch[2]) {
            console.log(`🔗 LinkMake: Found meta refresh redirect: ${urlMatch[2]}`);
            streamLinks.push({
              url: urlMatch[2].startsWith('http') ? urlMatch[2] : new URL(urlMatch[2], ctx.url).href,
            });
          }
        }

        // Check for JavaScript redirects (window.location)
        const scripts = $('script').toArray();
        for (const script of scripts) {
          const scriptContent = $(script).html() || '';
          const locationMatch = scriptContent.match(/(?:window\.location|location\.href)\s*=\s*['"]([^'"]+)['"]/);
          if (locationMatch && locationMatch[1]) {
            console.log(`🔗 LinkMake: Found JS redirect: ${locationMatch[1]}`);
            streamLinks.push({
              url: locationMatch[1].startsWith('http') ? locationMatch[1] : new URL(locationMatch[1], ctx.url).href,
            });
          }
        }
      }

      ctx.progress(60);

      // If we still have no links, try to follow the "View" or "Download" button which often requires an extra click
      if (streamLinks.length === 0) {
        console.log('🔗 LinkMake: No direct links found, trying to follow "View" or "Download" buttons');

        // Look for common button patterns
        const viewButtons = $(
          'a:contains("View"), a:contains("Download"), button:contains("View"), button:contains("Download")',
        );

        if (viewButtons.length > 0) {
          console.log(`🔗 LinkMake: Found ${viewButtons.length} view/download buttons`);

          for (let i = 0; i < viewButtons.length; i++) {
            const viewButton = viewButtons.eq(i);
            const viewLink = viewButton.attr('href');

            if (isValidUrl(viewLink)) {
              // Since we've checked viewLink is valid, we know it's defined
              const safeViewLink = viewLink as string;
              console.log(`🔗 LinkMake: Following view button link: ${safeViewLink}`);

              try {
                // Follow the view link
                const fullViewLink = safeViewLink.startsWith('http')
                  ? safeViewLink
                  : new URL(safeViewLink, ctx.url).href;
                const viewPage = await ctx.proxiedFetcher(fullViewLink, {
                  headers: {
                    'User-Agent':
                      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    Referer: ctx.url,
                  },
                });

                // Parse the page to find the download link
                const $view = load(viewPage);

                // Check for download links
                $view('a[href*=".mp4"], a[href*=".mkv"], a[href*=".avi"], a[href*="download"], a.download').each(
                  (j, dlEl) => {
                    const dlLink = $view(dlEl).attr('href');
                    if (isValidUrl(dlLink)) {
                      // Since we've checked dlLink is valid, we know it's defined
                      const safeDlLink = dlLink as string;
                      console.log(`🔗 LinkMake: Found download link: ${safeDlLink}`);
                      streamLinks.push({
                        url: safeDlLink.startsWith('http') ? safeDlLink : new URL(safeDlLink, fullViewLink).href,
                      });
                    }
                  },
                );

                // If still no links, check for iframe sources
                if (streamLinks.length === 0) {
                  $view('iframe').each((j, iframeEl) => {
                    const iframeSrc = $view(iframeEl).attr('src');
                    if (iframeSrc) {
                      console.log(`🔗 LinkMake: Found iframe in view page: ${iframeSrc}`);
                      streamLinks.push({
                        url: iframeSrc.startsWith('http') ? iframeSrc : new URL(iframeSrc, fullViewLink).href,
                      });
                    }
                  });
                }

                // If we found links, break the loop
                if (streamLinks.length > 0) {
                  break;
                }
              } catch (error) {
                console.log('🔗 LinkMake: Error following view button:', error);
              }
            }
          }
        }
      }

      ctx.progress(80);

      // If we still have no stream links, throw an error
      if (streamLinks.length === 0) {
        console.log('🔗 LinkMake: No stream links found after processing');
        throw new NotFoundError('No stream links found');
      }

      console.log(`🔗 LinkMake: Found ${streamLinks.length} stream links:`, streamLinks);

      // Build final stream output
      // For simplicity, we'll return an HLS stream since most modern players can handle direct mp4 links as HLS
      return {
        stream: [
          {
            id: 'primary',
            type: 'hls',
            playlist: streamLinks[0].url,
            flags: [flags.CORS_ALLOWED],
            headers: {
              Referer: new URL(ctx.url).origin,
            },
            captions: [],
          },
        ],
      };
    } catch (error) {
      console.log('🔗 LinkMake: Error processing page:', error);
      throw error;
    }
  },
});
