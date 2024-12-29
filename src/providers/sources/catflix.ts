/* eslint-disable no-console */
import { load } from 'cheerio';

import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext } from '@/utils/context';

const baseUrl = 'https://catflix.su';

async function comboScraper(ctx: MovieScrapeContext): Promise<SourcererOutput> {
  const movieId = ctx.media.tmdbId;
  const movieTitle = ctx.media.title.replace(/ /g, '-').replace(/[():]/g, '').toLowerCase();

  const watchPageUrl = `${baseUrl}/movie/${movieTitle}-${movieId}`;
  console.log('Watch page URL:', watchPageUrl);

  ctx.progress(60);

  function decodeBase64(encodedString: string): string {
    const decodedString = atob(encodedString);
    return decodedString;
  }

  const WatchPage = await ctx.proxiedFetcher(watchPageUrl);
  const $WatchPage = load(WatchPage);

  const scriptContent = $WatchPage('script')
    .toArray()
    .find((script) => {
      return (
        script.children[0] &&
        script.children[0].type === 'text' &&
        script.children[0].data.includes('const main_origin =')
      );
    });

  if (!scriptContent) {
    throw new Error('Script containing main_origin not found');
  }

  const mainOriginScript = scriptContent.children[0].type === 'text' ? scriptContent.children[0].data : '';
  const mainOriginMatch = mainOriginScript.match(/const main_origin = "(.*?)";/);

  if (!mainOriginMatch) {
    throw new Error('Unable to extract main_origin value');
  }

  const Catflix1 = mainOriginMatch[1];
  console.log('Catflix URL:', Catflix1);

  const decodedUrl = decodeBase64(Catflix1);

  ctx.progress(90);

  return {
    embeds: [
      {
        embedId: 'turbovid',
        url: decodedUrl,
      },
    ],
  };
}

export const catflixScraper = makeSourcerer({
  id: 'catflix',
  name: 'Catflix',
  rank: 122,
  flags: [flags.CORS_ALLOWED],
  disabled: false,
  scrapeMovie: comboScraper,
});
