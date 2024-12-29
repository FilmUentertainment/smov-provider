/* eslint-disable no-console */
import { load } from 'cheerio';

import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const baseUrl = 'https://uniquestream.net';

async function comboScraper(ctx: MovieScrapeContext): Promise<SourcererOutput> {
  const searchPage = await ctx.proxiedFetcher('/', {
    baseUrl,
    query: {
      s: ctx.media.title,
    },
  });

  ctx.progress(40);

  const $search = load(searchPage);
  const searchResults: { title: string; year?: number; url: string }[] = [];

  $search('.display-item a').each((_, element) => {
    const $element = $search(element);
    const title = $element.attr('title')?.trim();
    const url = $element.attr('href');

    if (!title || !url) return;

    searchResults.push({
      title,
      url,
    });
  });

  const mediaTitleWithYear = `${ctx.media.title} ${ctx.media.releaseYear}`.toLowerCase();

  const watchPageUrl = searchResults.find((result) => result.title.toLowerCase() === mediaTitleWithYear)?.url;

  if (!watchPageUrl) {
    console.error('Failed to find matching watch page URL.');
    console.error('Media title with year:', mediaTitleWithYear);
    console.error(
      'Search result titles:',
      searchResults.map((r) => r.title),
    );
    throw new NotFoundError('No matching watch page found');
  }

  console.log('Found watch page URL:', watchPageUrl);

  const watchPageContent = await ctx.proxiedFetcher(watchPageUrl);
  const watchPage = load(watchPageContent);

  const postId = watchPage('.btn-left .btn-login[data-itemid]').first().attr('data-itemid');
  const type = watchPage('.player-play.ajax').attr('data-type') || 'mv'; // Default to 'mv' if type is missing

  if (!postId) {
    throw new Error('Failed to find post ID for the AJAX request');
  }

  console.log('Post ID:', postId, 'Type:', type);

  ctx.progress(80);

  const ajaxResponse = await ctx.proxiedFetcher('/wp-admin/admin-ajax.php', {
    baseUrl,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      action: 'zeta_player_ajax',
      post: postId,
      nume: '1',
      type,
    }).toString(),
  });

  console.log('AJAX Response:', ajaxResponse);

  const ajaxData = ajaxResponse;

  if (!ajaxData.embed_url) {
    console.error('AJAX Response:', ajaxData);
    throw new Error('Failed to find embed URL in AJAX response');
  }

  const rawEmbedUrl = ajaxData.embed_url.match(/src="([^"]+)"/)?.[1];
  if (!rawEmbedUrl) {
    throw new Error('Failed to extract the iframe source URL');
  }

  const embedUrl = rawEmbedUrl.startsWith('//') ? `https:${rawEmbedUrl}` : rawEmbedUrl;

  console.log('Embed URL:', embedUrl);

  const hlsResponse = await ctx.proxiedFetcher(embedUrl, {
    method: 'GET',
    headers: {
      Referer: 'https://uniquestream.net/',
    },
  });

  const m3u8UrlMatch = hlsResponse.match(
    /let url = '(https:\/\/hls\.uniquestream\.net\/media\/db\/master\/[a-zA-Z0-9]+\.m3u8)'/,
  );

  if (!m3u8UrlMatch) {
    console.error('HLS Response:', hlsResponse);
    throw new Error('Failed to extract the m3u8 URL');
  }

  const m3u8Url = m3u8UrlMatch[1];
  console.log('Real m3u8 URL:', m3u8Url);

  return {
    embeds: [
      {
        embedId: 'turbovid',
        url: m3u8Url,
      },
    ],
  };
}

export const uniquestreamScraper = makeSourcerer({
  id: 'uniquestream',
  name: 'UniqueStream',
  rank: 142,
  disabled: false,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
});
