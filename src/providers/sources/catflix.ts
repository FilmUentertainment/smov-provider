/* eslint-disable no-console */
import { load } from 'cheerio';

import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext } from '@/utils/context';

const baseUrl = 'https://catflix.su';

async function comboScraper(ctx: MovieScrapeContext): Promise<SourcererOutput> {
  const movieId = ctx.media.tmdbId;
  const movieTitle = ctx.media.title.replace(/ /g, '-').toLowerCase();

  const watchPageUrl = `${baseUrl}/movie/${movieTitle}-${movieId}`;
  console.log('Watch page URL:', watchPageUrl);

  ctx.progress(60);

  const watchPage = load(await ctx.proxiedFetcher(watchPageUrl));

  ctx.progress(80);

  const url = watchPage('iframe').first().attr('src'); // I couldn't think of a better way
  if (!url) throw new Error('Failed to find embed url');

  ctx.progress(90);

  return {
    embeds: [
      {
        embedId: 'turbovid',
        url,
      },
    ],
  };
}

export const catflixScraper = makeSourcerer({
  id: 'catflix',
  name: 'Catflix',
  rank: 122,
  flags: [],
  disabled: true,
  scrapeMovie: comboScraper,
});
