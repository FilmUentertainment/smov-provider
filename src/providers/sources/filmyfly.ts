/* eslint-disable no-console */
import { load } from 'cheerio';
import type { Element } from 'cheerio';

import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const baseUrl = 'https://filmyfly.fi';

async function comboScraper(ctx: MovieScrapeContext | ShowScrapeContext): Promise<SourcererOutput> {
  const mediaTitle = ctx.media.title;
  const mediaType = ctx.media.type;
  const searchQuery = encodeURIComponent(mediaTitle.trim());

  // Search for the content
  const searchUrl = `${baseUrl}/site-1.html?to-search=${searchQuery}`;
  ctx.progress(30);

  const searchPage = await ctx.proxiedFetcher(searchUrl);
  const $ = load(searchPage);

  // Process search results
  const searchResults: { title: string; link: string }[] = [];
  $('.A2, .A10, .fl').each((i, el: Element) => {
    const title = $(el).find('a').eq(1).text().trim() || $(el).find('b').text().trim();
    const link = $(el).find('a').attr('href');

    if (title && link) {
      searchResults.push({ title, link });
    }
  });

  if (searchResults.length === 0) {
    throw new NotFoundError('No search results found');
  }

  // Find the most relevant result
  const relevantResult =
    searchResults.find(
      (result) =>
        result.title.toLowerCase().includes(mediaTitle.toLowerCase()) ||
        (mediaType === 'show' && result.title.toLowerCase().includes('web series')),
    ) || searchResults[0];

  const contentLink = relevantResult.link;
  const fullContentUrl = contentLink.startsWith('http') ? contentLink : baseUrl + contentLink;
  ctx.progress(50);

  // Get content page
  const contentPage = await ctx.proxiedFetcher(fullContentUrl);
  const $content = load(contentPage);

  let targetUrl = fullContentUrl;

  // For TV shows, try to find the specific episode
  if (mediaType === 'show') {
    const seasonNumber = ctx.media.season.number;
    const episodeNumber = ctx.media.episode.number;

    // Look for season/episode pattern in links
    const episodePatterns = [
      new RegExp(`S0?${seasonNumber}E0?${episodeNumber}`, 'i'),
      new RegExp(`Season\\s*${seasonNumber}\\s*Episode\\s*${episodeNumber}`, 'i'),
      new RegExp(`EP0?${episodeNumber}`, 'i'),
      new RegExp(`Episode\\s*${episodeNumber}`, 'i'),
    ];

    let episodeLink = '';
    $content('.dlbtn a, .dlink.dl a, .button2, .button1, .button3, .button4, .button').each((i, el: Element) => {
      const text = $content(el).text().trim();
      const link = $content(el).attr('href');

      if (link && text) {
        const matches = episodePatterns.some((pattern) => pattern.test(text));
        if (matches) {
          episodeLink = link;
          return false; // break each loop
        }
      }
    });

    if (episodeLink) {
      targetUrl = episodeLink.startsWith('http') ? episodeLink : baseUrl + episodeLink;
      // Get the episode page
      const episodePage = await ctx.proxiedFetcher(targetUrl);
      $content.load(episodePage);
    }
  }

  ctx.progress(70);

  // Find download/stream links
  const embeds: { embedId: string; url: string }[] = [];

  // Check download links (primary way to get links)
  $content('.dlbtn a, .dlink.dl a').each((i, el: Element) => {
    const title = $content(el).text().trim();
    const link = $content(el).attr('href');

    if (link && title) {
      // Check if link is a linkmake.in URL
      if (link.includes('linkmake.in')) {
        embeds.push({
          embedId: 'linkmake',
          url: link,
        });
      } else {
        embeds.push({
          embedId: 'direct',
          url: link,
        });
      }
    }
  });

  // If no download links found, check other buttons
  if (embeds.length === 0) {
    $content('.button2, .button1, .button3, .button4, .button').each((i, el: Element) => {
      const title = $content(el).text().trim();
      const link = $content(el).attr('href');

      if (link && title && !title.includes('Watch') && !title.includes('Login') && !title.includes('GoFile')) {
        // Check if link is a linkmake.in URL
        if (link.includes('linkmake.in')) {
          embeds.push({
            embedId: 'linkmake',
            url: link,
          });
        } else {
          embeds.push({
            embedId: 'direct',
            url: link,
          });
        }
      }
    });
  }

  if (embeds.length === 0) {
    throw new NotFoundError('No embeds found');
  }

  ctx.progress(90);

  return {
    embeds,
  };
}

export const filmyflyScraper = makeSourcerer({
  id: 'filmyfly',
  name: 'FilmyFly',
  rank: 540,
  disabled: false,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
