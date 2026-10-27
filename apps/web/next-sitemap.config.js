/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: 'https://worn.app',
  generateRobotsTxt: true,
  generateIndexSitemap: true,
  exclude: ['/server-sitemap.xml', '/api/*', '/_next/*', '/static/*', '/admin/*'],
  robotsTxtOptions: {
    policies: [
      { userAgent: '*', allow: '/' },
      {
        userAgent: '*',
        disallow: ['/api/', '/_next/', '/static/', '/admin/', '/dashboard/', '/account/', '/settings/'],
      },
    ],
    additionalSitemaps: ['https://worn.app/sitemap.xml'],
  },
  sitemapSize: 5000,
  changefreq: 'weekly',
  priority: 0.7,
  lastmod: new Date().toISOString(),
  transform: async (config, path) => {
    const priorityMap = {
      '/': 1.0,
      '/pricing': 0.8,
      '/features': 0.8,
      '/about': 0.6,
      '/blog': 0.7,
      '/help': 0.5,
      '/privacy': 0.3,
      '/terms': 0.3,
      '/security': 0.3,
      '/careers': 0.4,
      '/press': 0.4,
    };

    const changefreqMap = {
      '/': 'weekly',
      '/blog': 'daily',
      '/pricing': 'monthly',
      '/features': 'monthly',
      '/about': 'monthly',
      '/help': 'monthly',
      '/privacy': 'yearly',
      '/terms': 'yearly',
      '/security': 'yearly',
      '/careers': 'weekly',
      '/press': 'monthly',
    };

    return {
      loc: path,
      changefreq: changefreqMap[path] || 'weekly',
      priority: priorityMap[path] || 0.7,
      lastmod: new Date().toISOString(),
    };
  },
};