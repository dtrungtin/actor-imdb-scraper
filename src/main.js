/* eslint-disable no-nested-ternary */
const Apify = require('apify');

const { log } = Apify.utils;

function toArrayString(str) {
    return str.split('\n').join('').split('|').map(Function.prototype.call, String.prototype.trim)
        .join(', ');
}

const isObject = val => typeof val === 'object' && val !== null && !Array.isArray(val);

function extractData(request, $) {
    if (request.userData.label === 'item') {
        const scriptData = $('script[type="application/ld+json"]')[0];
        const scriptText = scriptData.children[0].data.trim();
        const { name, alternateName, aggregateRating, description, genre, actor, director } = JSON.parse(scriptText);

        const itemTitleParent = $('.titleParent a,[data-testid*=series-link]').text().trim();
        const isEpisode = itemTitleParent !== '';
        let itemTitle = isEpisode ? `${itemTitleParent} - ${$('h1').text().trim()}` : $('h1').text().trim();
        const itemOriginalTitle = alternateName ? name : null;

        let itemRuntime = $('[data-testid*=runtime] .ipc-metadata-list-item__content-container').text().trim();
        let parts = itemRuntime.match(/(\d+)\s*hours*\s*(\d+)\s*minutes*/);
        if (parts) {
            const minuteTotal = parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
            itemRuntime = minuteTotal;
        } else {
            itemRuntime = parseInt(itemRuntime.split('minutes')[0].trim(), 10);
        }

        const yearMatch = itemTitle.match(/[(](\d{4})[)]/);
        parts = $('[href*=releaseinfo]').text().match(/\d{4}/);
        const itemYear = yearMatch ? yearMatch[1] : (parts ? parts[0] : '');
        if (!yearMatch && itemYear) {
            itemTitle = `${itemTitle} (${itemYear})`;
        }

        let itemCountry = toArrayString($('h4:contains(Country)').parent().text()
            .replace('Country:', '')
            .trim());
        if (itemCountry === '') {
            parts = $('[href*=releaseinfo]').text().match(/\((.+)\)/);
            itemCountry = parts ? parts[1] : '';
        }

        if (itemCountry === '') {
            for (let index = 0; index < $('[href*=country_of_origin]').length; index++) {
                const country = $('[href*=country_of_origin]').eq(index).text();
                if (index > 0) {
                    itemCountry += ', ';
                }
                itemCountry += country;
            }
        }
        const itemCert = $('h4:contains(Certificate:)').parent().text()
            .replace('Certificate:', '')
            .trim()
            .split('|')[0].trim();

        return {
            title: itemTitle,
            'original title': itemOriginalTitle,
            isEpisode,
            runtime: itemRuntime,
            certificate: (itemCert !== '' && !itemCert.includes('See all')) ? itemCert : request.userData.certificates,
            year: itemYear ? parseInt(itemYear, 10) : null,
            rating: aggregateRating ? aggregateRating.ratingValue : null,
            ratingcount: aggregateRating ? aggregateRating.ratingCount : null,
            description,
            stars: actor ? actor.map(x => x.name).join(', ') : null,
            director: director ? director.map(x => x.name).join(', ') : null,
            genre: genre ? genre.join(', ') : null,
            country: itemCountry,
            url: request.url,
            '#debug': Apify.utils.createRequestDebugInfo(request),
        };
    }

    if (request.userData.label === 'parentalguide') {
        const itemList = $('#certificates .ipl-inline-list__item a');
        const certificates = [];
        for (let index = 0; index < itemList.length; index++) {
            const $item = $(itemList[index]);
            certificates.push($item.text().trim());
        }

        return certificates;
    }
}

let detailsEnqueued = 0;

Apify.events.on('migrating', async () => {
    await Apify.setValue('detailsEnqueued', detailsEnqueued);
});

Apify.main(async () => {
    const input = await Apify.getInput();
    console.log('Input:');
    console.log(input);

    if (!input || !Array.isArray(input.startUrls) || input.startUrls.length === 0) {
        throw new Error("Invalid input, it needs to contain at least one url in 'startUrls'.");
    }

    let extendOutputFunction;
    if (typeof input.extendOutputFunction === 'string' && input.extendOutputFunction.trim() !== '') {
        try {
            extendOutputFunction = eval(input.extendOutputFunction); // eslint-disable-line no-eval
        } catch (e) {
            throw new Error(`'extendOutputFunction' is not valid Javascript! Error: ${e}`);
        }
        if (typeof extendOutputFunction !== 'function') {
            throw new Error('extendOutputFunction is not a function! Please fix it or use just default ouput!');
        }
    }

    const requestQueue = await Apify.openRequestQueue();

    detailsEnqueued = await Apify.getValue('detailsEnqueued');
    if (!detailsEnqueued) {
        detailsEnqueued = 0;
    }

    function checkLimit() {
        return input.maxItems && detailsEnqueued >= input.maxItems;
    }

    const startUrls = await (async () => {
        const urls = [];
        const rl = await Apify.openRequestList('STARTURLS', input.startUrls);
        let req;

        while (req = await rl.fetchNextRequest()) { // eslint-disable-line no-cond-assign
            urls.push(req);
        }

        return urls;
    })();

    for (const request of startUrls) {
        const startUrl = request.url;

        if (checkLimit()) {
            break;
        }

        if (startUrl.includes('https://www.imdb.com/')) {
            const movieDetailMatch = startUrl.match(/https:\/\/www.imdb.com\/title\/(\w{9,10})/);
            if (movieDetailMatch !== null) {
                const itemId = movieDetailMatch[1];
                const itemUrl = `https://www.imdb.com/title/${itemId}/parentalguide`;

                const rq = await requestQueue.addRequest({ url: `${itemUrl}`, userData: { label: 'parentalguide', id: itemId } },
                    { forefront: true });

                if (!rq.wasAlreadyPresent) {
                    detailsEnqueued++;
                }
            } else if (startUrl.includes('/find/?')) {
                await requestQueue.addRequest({ url: startUrl, userData: { label: 'find' } });
            } else {
                await requestQueue.addRequest({ url: startUrl, userData: { label: 'start' } });
            }
        }
    }

    const proxyConfiguration = await Apify.createProxyConfiguration({ ...input.proxyConfiguration, countryCode: 'US' });

    const crawler = new Apify.CheerioCrawler({
        requestQueue,

        handleRequestTimeoutSecs: 120,
        requestTimeoutSecs: 120,
        handlePageTimeoutSecs: 240,
        maxConcurrency: 5,
        proxyConfiguration,
        useSessionPool: true,
        persistCookiesPerSession: true,

        handlePageFunction: async ({ request, $, body }) => {
            log.info(`open url(${request.userData.label}): ${request.url}`);

            if (request.userData.label === 'find') {
                const items = $('.find-title-result');
                log.info(items.length);

                for (let index = 0; index < items.length; index++) {
                    if (checkLimit()) {
                        return;
                    }

                    const links = items.eq(index).find('a[href*="/title/"]');
                    const isEpisode = links.length > 1;
                    const itemLink = links.eq(0);
                    const href = itemLink.attr('href');
                    const itemId = href.match(/\/title\/(\w{9,10})/)[1];

                    const itemUrl = `https://www.imdb.com/title/${itemId}/parentalguide`;

                    const rq = await requestQueue.addRequest({ url: `${itemUrl}`, userData: { label: 'parentalguide', id: itemId, isEpisode } },
                        { forefront: true });

                    if (!rq.wasAlreadyPresent) {
                        detailsEnqueued++;
                    }
                }
            } else if (request.userData.label === 'start') {
                const paginationEle = $('.desc span');
                if (!paginationEle || paginationEle.text() === '') {
                    return;
                }

                log.info(paginationEle.eq(0).text());

                const items = $('.lister-list .lister-item');
                log.info(items.length);

                for (let index = 0; index < items.length; index++) {
                    if (checkLimit()) {
                        return;
                    }

                    const links = items.eq(index).find('.lister-item-header a[href*="/title/"]');
                    const isEpisode = links.length > 1;
                    const itemLink = isEpisode ? links.eq(1) : links.eq(0);
                    const href = itemLink.attr('href');
                    const itemId = href.match(/\/title\/(\w{9,10})/)[1];

                    const itemUrl = `https://www.imdb.com/title/${itemId}/parentalguide`;

                    const rq = await requestQueue.addRequest({ url: `${itemUrl}`, userData: { label: 'parentalguide', id: itemId, isEpisode } },
                        { forefront: true });

                    if (!rq.wasAlreadyPresent) {
                        detailsEnqueued++;
                    }
                }

                if (paginationEle.eq(0).text().includes('of')) {
                    const content = paginationEle.text().match(/of\s+(\d+[.,]?\d*[.,]?\d*)/)[1];
                    const pageCount = Math.floor(parseInt(content.replace(/,/g, ''), 10) / 50); // Each page has 50 items

                    if (pageCount > 0) {
                        const index = 1;
                        const startNumber = index * 50 + 1;
                        let startUrl = request.url;
                        startUrl += `${startUrl.includes('?') ? '&' : '?'}start=${startNumber}`;
                        await requestQueue.addRequest({ url: startUrl, userData: { label: 'list', current: index, total: pageCount } });
                    }
                }
            } else if (request.userData.label === 'list') {
                const paginationEle = $('.desc span');
                log.info(paginationEle.eq(0).text());

                const items = $('.lister-list .lister-item');
                log.info(items.length);

                for (let index = 0; index < items.length; index++) {
                    if (checkLimit()) {
                        return;
                    }

                    const links = items.eq(index).find('.lister-item-header a[href*="/title/"]');
                    const isEpisode = links.length > 1;
                    const itemLink = isEpisode ? links.eq(1) : links.eq(0);
                    const href = itemLink.attr('href');
                    const itemId = href.match(/\/title\/(\w{9,10})/)[1];
                    const itemUrl = `https://www.imdb.com/title/${itemId}/parentalguide`;

                    const rq = await requestQueue.addRequest({ url: `${itemUrl}`, userData: { label: 'parentalguide', id: itemId, isEpisode } },
                        { forefront: true });

                    if (!rq.wasAlreadyPresent) {
                        detailsEnqueued++;
                    }
                }

                const index = request.userData.current + 1;
                const pageCount = request.userData.total;

                if (index <= pageCount) {
                    const startNumber = index * 50 + 1;
                    const startUrl = request.url.replace(/&start=\d+/, `&start=${startNumber}`);
                    await requestQueue.addRequest({ url: startUrl, userData: { label: 'list', current: index, total: pageCount } });
                }
            } else if (request.userData.label === 'parentalguide') {
                const { isEpisode } = request.userData;
                const certificates = extractData(request, $);
                const itemCertificates = certificates.join(', ');
                const itemUrl = `https://www.imdb.com/title/${request.userData.id}/`;

                await requestQueue.addRequest({ url: `${itemUrl}`, userData: { label: 'item', certificates: itemCertificates, isEpisode } },
                    { forefront: true });
            } else if (request.userData.label === 'item') {
                await Apify.setValue('body_html', body, { contentType: 'text/html' });
                const pageResult = extractData(request, $);
                let userResult = {};

                if (extendOutputFunction) {
                    userResult = await extendOutputFunction($);

                    if (!isObject(userResult)) {
                        log.info('extendOutputFunction has to return an object!!!');
                        process.exit(1);
                    }
                }

                await Apify.pushData({ ...pageResult, ...userResult });
            }
        },

        handleFailedRequestFunction: async ({ request }) => {
            await Apify.pushData({
                '#isFailed': true,
                '#debug': Apify.utils.createRequestDebugInfo(request),
            });
        },
    });

    await crawler.run();
});
