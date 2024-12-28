import { load } from 'cheerio';

import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { compareMedia } from '@/utils/compare';
import { MovieScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const baseUrl = 'https://hydrahd.me';

async function comboScraper(ctx: MovieScrapeContext): Promise<SourcererOutput> {
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
    throw new Error('No server URL found in the AJAX response');
  }

  return {
    embeds: [
      {
        embedId: 'turbovid',
        url: serverUrls[0],
      },
    ],
  };
}

export const hydrahdScraper = makeSourcerer({
  id: 'hydrahd',
  name: 'HydraHD',
  rank: 122,
  flags: [],
  scrapeMovie: comboScraper,
});
