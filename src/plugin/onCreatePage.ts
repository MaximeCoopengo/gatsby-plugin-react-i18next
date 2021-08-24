import { CreatePageArgs, Page } from 'gatsby';
import BP from 'bluebird';
import { match } from 'path-to-regexp';
import { PageContext, PageOptions, PluginOptions } from '../types';

const getDynamicPage = (
  path: string,
  dynamicPages: string[],
  lng: string = ''
) =>
  dynamicPages.filter(pageName => {
    const regexp = new RegExp(`^${lng}/${pageName}`);
    if (regexp.test(path)) {
      return true;
    }

    return false;
  })[0];

export const onCreatePage = async (
  { page, actions }: CreatePageArgs<PageContext>,
  pluginOptions: PluginOptions
) => {
  //Exit if the page has already been processed.
  if (typeof page.context.i18n === 'object') {
    return;
  }

  const { createPage, deletePage } = actions;
  const {
    defaultLanguage = 'en',
    generateDefaultLanguagePage = false,
    languages = ['en'],
    pages = [],
    dynamicPages = [],
  } = pluginOptions;

  type GeneratePageParams = {
    language: string;
    path?: string;
    originalPath?: string;
    routed?: boolean;
    pageOptions?: PageOptions;
    matchPath?: string;
  };
  const generatePage = async ({
    language,
    path = page.path,
    originalPath = page.path,
    routed = false,
    pageOptions,
    matchPath = page.matchPath,
  }: GeneratePageParams): Promise<Page<PageContext>> => {
    return {
      ...page,
      path,
      matchPath,
      context: {
        ...page.context,
        language,
        i18n: {
          language,
          languages: pageOptions?.languages || languages,
          defaultLanguage,
          generateDefaultLanguagePage,
          routed,
          originalPath,
          path,
        },
      },
    };
  };

  const pageOptions = pages.find(opt => match(opt.matchPath)(page.path));

  let newPage;
  let alternativeLanguages = generateDefaultLanguagePage
    ? languages
    : languages.filter(lng => lng !== defaultLanguage);

  if (pageOptions?.excludeLanguages) {
    alternativeLanguages = alternativeLanguages.filter(
      lng => !pageOptions?.excludeLanguages?.includes(lng)
    );
  }

  if (pageOptions?.languages) {
    alternativeLanguages = generateDefaultLanguagePage
      ? pageOptions.languages
      : pageOptions.languages.filter(lng => lng !== defaultLanguage);
  }

  const dynamicPage = getDynamicPage(page.path, dynamicPages);
  let originalPath = page.path;
  let matchPath = page.matchPath;

  if (dynamicPage) {
    originalPath = `${originalPath}:id`;
    matchPath = `/${dynamicPage}/*`;
  }

  if (pageOptions?.getLanguageFromPath) {
    const result = match<{ lang: string }>(pageOptions.matchPath)(page.path);
    if (!result) return;
    const language =
      languages.find(lng => lng === result.params.lang) || defaultLanguage;
    const routed = Boolean(result.params.lang);

    originalPath = originalPath.replace(`/${language}`, '');

    newPage = await generatePage({
      language,
      originalPath,
      routed,
      pageOptions,
      matchPath,
    });
    if (routed || !pageOptions.excludeLanguages) {
      alternativeLanguages = [];
    }
  } else {
    newPage = await generatePage({
      language: defaultLanguage,
      originalPath,
      pageOptions,
      matchPath,
    });
  }

  try {
    deletePage(page);
  } catch {}
  createPage(newPage);

  await BP.map(alternativeLanguages, async lng => {
    let lngMatchPath = matchPath;

    if (dynamicPage) {
      lngMatchPath = `/${lng}${matchPath}`;
    }

    const regexp404 = new RegExp('/404/?$');
    if (regexp404.test(page.path)) {
      lngMatchPath = `/${lng}/*`;
    }

    const localePage = await generatePage({
      language: lng,
      path: `${lng}${page.path}`,
      originalPath,
      routed: true,
      matchPath: lngMatchPath,
    });

    createPage(localePage);
  });
};
