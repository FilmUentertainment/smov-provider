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

  /* gets something like:
  Available servers: [
    'https://ythd.org/embed/tt18412256/',
    'https://vidlink.pro/movie/945961?primaryColor=ce0d0d&secondaryColor=000000&iconColor=ffffff&poster=true&icons=vid&autoplay=true&ref=mapple',
    'https://vidsrc.cc/v2/embed/movie/945961?autoPlay=true',
    'https://vidsrc.vip/embed/movie/945961',
    'https://moviesapi.club/movie/945961',
    'https://ply4.com/movie/?id=tt18412256',
    'https://www.primewire.tf/embed/movie?imdb=tt18412256',
    'https://kllamrd.org/video/tt18412256',
    'https://frembed.pro/api/film.php?id=tt18412256',
    'https://player.autoembed.cc/embed/movie/tt18412256'
  ]
  */

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
        embedId: '', // 'moviesapi', new embed
        url: serverUrls[4],
      },
      {
        embedId: '', // 'ply4', new embed
        url: serverUrls[5],
      },
      {
        embedId: '', // 'primewire', new embed maybe?
        url: serverUrls[6],
      },
      {
        embedId: '', // 'killamrd', new embed
        url: serverUrls[7],
      },
      {
        embedId: '', // 'frembed', new embed
        url: serverUrls[8],
      },
      {
        embedId: '', // 'autoembed',i just dont understand this one
        url: serverUrls[9],
      },
    ],
  };
}

export const hydrahdScraper = makeSourcerer({
  id: 'hydrahd',
  name: 'HydraHD',
  rank: 123,
  disabled: true,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
});
