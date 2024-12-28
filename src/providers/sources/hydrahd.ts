/* eslint-disable no-console */
import { load } from 'cheerio';

import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { compareMedia } from '@/utils/compare';
import { MovieScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const baseUrl = 'https://hydrahd.me';

async function comboScraper(ctx: MovieScrapeContext): Promise<SourcererOutput> {
  // Searching and finding the watch page so we can use it as a refer for the ajax request
  const searchPage = await ctx.proxiedFetcher('/index.php', {
    baseUrl,
    query: {
      menu: 'search',
      query: ctx.media.title,
    },
  });

  ctx.progress(40);

  const $search = load(searchPage);
  const searchResults: { title: string; year?: number; url: string }[] = [];

  $search('.browse-grid figure').each((_, element) => {
    const $element = $search(element);
    const title = $element.find('.title.detz').text().trim();
    const url = $element.find('a.hthis').attr('href');

    if (!title || !url) return;

    searchResults.push({
      title,
      url: `${baseUrl}${url}`,
    });
  });

  const watchPageUrl = searchResults.find((x) => x && compareMedia(ctx.media, x.title, x.year))?.url;
  if (!watchPageUrl) throw new NotFoundError('No watchable item found');

  ctx.progress(60);

  // ajax page maybe
  const { imdbId, tmdbId } = ctx.media;
  const ajaxUrl = `/ajax/mov_0.php?i=${imdbId}&t=${tmdbId}`;

  const ajaxResponse = await ctx.proxiedFetcher(ajaxUrl, {
    baseUrl,
    headers: {
      Host: 'hydrahd.me',
      Referer: watchPageUrl,
    },
  });

  ctx.progress(70);

  const $ajaxPage = load(ajaxResponse);

  const serverUrls: string[] = [];
  $ajaxPage('.iframe-server-button').each((_, element) => {
    const url = $ajaxPage(element).attr('data-link');
    if (url) {
      serverUrls.push(url);
    }
  });

  if (serverUrls.length === 0) {
    throw new Error('No URL found in response');
  }

  ctx.progress(90);

  // now we get the embed source url
  const embedUrl = load(await ctx.proxiedFetcher(serverUrls[0]));

  const url = embedUrl('iframe').first().attr('src');
  if (!url) throw new Error('Failed to find embed url');

  return {
    embeds: [
      {
        embedId: 'vidsrcembed',
        url,
      },
    ],
  };
}

export const hydrahdScraper = makeSourcerer({
  id: 'hydrahd',
  name: 'HydraHD',
  rank: 122,
  disabled: false,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
});
