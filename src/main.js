const Apify = require('apify');

const { log } = Apify.utils;

function toArrayString(str) {
    return str.split('\n').join('').split('|').map(Function.prototype.call, String.prototype.trim)
        .join(', ');
}

const isObject = val => typeof val === 'object' && val !== null && !Array.isArray(val);

function extractData(request, $) {
    if (request.userData.label === 'item') {
        const itemTitle = $('.title_wrapper h1').text().trim();
        if (!itemTitle) {
            throw new Error('Something wrong! Retrying...');
        }

        const itemOriginalTitle = $('.title_wrapper .originalTitle').clone().children().remove()
            .end()
            .text()
            .trim();
        const itemRuntime = $('h4:contains(Runtime:)').parent().text()
            .replace('Runtime:', '')
            .split('min')[0].trim();
        const yearMatch = itemTitle.match(/[(](\d{4})[)]/);
        const parts = $('.subtext [href*=releaseinfo]').text().match(/\d{4}/);
        // eslint-disable-next-line no-nested-ternary
        const itemYear = yearMatch ? yearMatch[1] : (parts ? parts[0] : '');
        const itemRating = $('.ratingValue').text().trim().split('/')[0];
        const itemRatingCount = $('span[itemprop=ratingCount]').text().trim()
            .split(',')
            .join('');
        let desc = $('.summary_text').clone().children().remove()
            .end()
            .text()
            .trim()
            .replace('»', '')
            .trim();
        if (desc.endsWith('...')) {
            desc = $('#titleStoryLine h2:contains(Storyline)').next().text().trim();
        }
        const itemStars = $('h4:contains(Star:),h4:contains(Stars:)').parent().text()
            .replace('Star:', '')
            .replace('Stars:', '')
            .trim()
            .split('|')[0].trim();
        const itemDirector = $('h4:contains(Director:),h4:contains(Directors:)').parent().text()
            .replace('Director:', '')
            .replace('Directors:', '')
            .trim();
        const itemGenres = toArrayString($('h4:contains(Genres:)').parent().text()
            .replace('Genres:', '')
            .trim());
        const itemCountry = toArrayString($('h4:contains(Country)').parent().text()
            .replace('Country:', '')
            .trim());
        const itemCert = $('h4:contains(Certificate:)').parent().text()
            .replace('Certificate:', '')
            .trim()
            .split('|')[0].trim();

        return {
            title: itemTitle,
            'original title': itemOriginalTitle,
            runtime: itemRuntime,
            certificate: (itemCert !== '') ? itemCert : request.userData.certificates,
            year: itemYear,
            rating: itemRating,
            ratingcount: itemRatingCount,
            description: desc,
            stars: itemStars,
            director: itemDirector,
            genre: itemGenres,
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

                await requestQueue.addRequest({ url: `${itemUrl}`, userData: { label: 'parentalguide', id: itemId } },
                    { forefront: true });

                detailsEnqueued++;
            } else {
                await requestQueue.addRequest({ url: startUrl, userData: { label: 'start' } });
            }
        }
    }

    const proxyConfiguration = await Apify.createProxyConfiguration({ ...input.proxyConfiguration });

    const crawler = new Apify.CheerioCrawler({
        requestQueue,

        handleRequestTimeoutSecs: 120,
        requestTimeoutSecs: 120,
        handlePageTimeoutSecs: 240,
        maxConcurrency: 5,
        proxyConfiguration,

        handlePageFunction: async ({ request, $ }) => {
            if (request.userData.label === 'start') {
                const paginationEle = $('.desc span');
                if (!paginationEle || paginationEle.text() === '') {
                    return;
                }

                log.info(paginationEle.eq(0).text());

                const itemLinks = $('.lister-list .lister-item-header a[href*="/title/"]');
                for (let index = 0; index < itemLinks.length; index++) {
                    if (checkLimit()) {
                        return;
                    }

                    const href = $(itemLinks[index]).attr('href');
                    const itemId = href.match(/\/title\/(\w{9,10})/)[1];

                    const itemUrl = `https://www.imdb.com/title/${itemId}/parentalguide`;

                    await requestQueue.addRequest({ url: `${itemUrl}`, userData: { label: 'parentalguide', id: itemId } },
                        { forefront: true });

                    detailsEnqueued++;
                }

                if (paginationEle.eq(0).text().includes('of')) {
                    const content = paginationEle.text().match(/of\s+(\d+[.,]?\d*[.,]?\d*)/)[1];
                    const pageCount = Math.floor(parseInt(content.replace(/,/g, ''), 10) / 50); // Each page has 50 items

                    if (pageCount > 0) {
                        const index = 1;
                        const startNumber = index * 50 + 1;
                        let startUrl = request.url;
                        startUrl += `${startUrl.split('?')[1] ? '&' : '?'}start=${startNumber}`;
                        await requestQueue.addRequest({ url: startUrl, userData: { label: 'list', current: index, total: pageCount } });
                    }
                }
            } else if (request.userData.label === 'list') {
                const itemLinks = $('.lister-list .lister-item-header a[href*="/title/"]');
                for (let index = 0; index < itemLinks.length; index++) {
                    if (checkLimit()) {
                        return;
                    }

                    const href = $(itemLinks[index]).attr('href');
                    const itemId = href.match(/\/title\/(\w{9,10})/)[1];
                    const itemUrl = `https://www.imdb.com/title/${itemId}/parentalguide`;

                    await requestQueue.addRequest({ url: `${itemUrl}`, userData: { label: 'parentalguide', id: itemId } },
                        { forefront: true });

                    detailsEnqueued++;
                }

                const index = request.userData.current + 1;
                const pageCount = request.userData.total;

                if (index < pageCount) {
                    const startNumber = index * 50 + 1;
                    let startUrl = request.url;
                    startUrl += `${startUrl.split('?')[1] ? '&' : '?'}start=${startNumber}`;
                    await requestQueue.addRequest({ url: startUrl, userData: { label: 'list', current: index, total: pageCount } });
                }
            } else if (request.userData.label === 'parentalguide') {
                const certificates = extractData(request, $);
                const itemCertificates = certificates.join(', ');
                const itemUrl = `https://www.imdb.com/title/${request.userData.id}`;

                await requestQueue.addRequest({ url: `${itemUrl}`, userData: { label: 'item', certificates: itemCertificates } },
                    { forefront: true });
            } else if (request.userData.label === 'item') {
                const pageResult = extractData(request, $);
                let userResult = {};

                if (extendOutputFunction) {
                    userResult = await extendOutputFunction($);

                    if (!isObject(userResult)) {
                        console.log('extendOutputFunction has to return an object!!!');
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
