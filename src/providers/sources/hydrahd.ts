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

  console.log('Available servers:', serverUrls);

  return {
    embeds: [
      {
        embedId: 'vidsrcembed',
        url: serverUrls[0],
      },
      {
        embedId: 'vidsrcembed',
        url: serverUrls[1],
      },
      {
        embedId: 'vidsrcembed',
        url: serverUrls[2],
      },
      {
        embedId: 'vidsrcembed',
        url: serverUrls[3],
      },
      {
        embedId: 'turbovid', // 'moviesapi', not real
        url: serverUrls[4],
      },
      {
        embedId: 'turbovid', // 'ply4', not real
        url: serverUrls[5],
      },
      {
        embedId: 'turbovid', // 'primewire', not real
        url: serverUrls[6],
      },
      {
        embedId: 'turbovid', // 'killamrd', not real
        url: serverUrls[7],
      },
      {
        embedId: 'turbovid', // 'frembed', not real
        url: serverUrls[8],
      },
      {
        embedId: 'turbovid', // 'autoembed',i just dont understand this one
        url: serverUrls[9],
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
