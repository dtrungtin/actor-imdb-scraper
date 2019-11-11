const Apify = require('apify');
const _ = require('underscore');
const safeEval = require('safe-eval');

function toArrayString(str) {
    return str.split('\n').join('').split('|').map(Function.prototype.call, String.prototype.trim)
        .join(', ');
}

function extractData(request, $) {
    if (request.userData.label === 'item') {
        const itemTitle = $('.title_wrapper h1').text().trim();
        const itemOriginalTitle = $('.title_wrapper .originalTitle').clone().children().remove()
            .end()
            .text()
            .trim();
        const itemRuntime = $('h4:contains(Runtime:)').parent().text()
            .replace('Runtime:', '')
            .split('min')[0].trim();
        const yearMatch = itemTitle.match(/(\d+)/);
        const itemYear = yearMatch ? yearMatch[0] : '';
        const itemRating = $('.ratingValue').text().trim().split('/')[0];
        const itemRatingCount = $('span[itemprop=ratingCount]').text().trim()
            .split(',')
            .join('');
        const desc = $('.summary_text').clone().children().remove()
            .end()
            .text()
            .trim()
            .replace('»', '')
            .trim();
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
    } else if (request.userData.label === 'parentalguide') {
        const itemList = $('#certificates .ipl-inline-list__item a');
        const certificates = [];
        for (const item of itemList) {
            const $item = $(item);
            certificates.push($item.text().trim());
        }

        return certificates;
    }
}

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
            extendOutputFunction = safeEval(input.extendOutputFunction);
        } catch (e) {
            throw new Error(`'extendOutputFunction' is not valid Javascript! Error: ${e}`);
        }
        if (typeof extendOutputFunction !== 'function') {
            throw new Error('extendOutputFunction is not a function! Please fix it or use just default ouput!');
        }
    }

    const dataset = await Apify.openDataset();
    const { itemCount } = await dataset.getInfo();
    let pagesOutputted = itemCount;
    const requestQueue = await Apify.openRequestQueue();

    for (const startUrl of input.startUrls) {
        if (startUrl.includes('https://www.imdb.com/')) {
            const movieDetailMatch = startUrl.match(/https:\/\/www.imdb.com\/title\/(\w{9})/);
            if (movieDetailMatch  !== null) {
                const itemId = movieDetailMatch[1];
                const itemUrl = `https://www.imdb.com/title/${itemId}/parentalguide`;

                await requestQueue.addRequest({ url: `${itemUrl}`, userData: { label: 'parentalguide', id: itemId } },
                    { forefront: true });
            } else {
                await requestQueue.addRequest({ url: startUrl, userData: { label: 'start' } });
            }
        }
    }

    const crawler = new Apify.CheerioCrawler({
        requestQueue,
        handlePageFunction: async ({ request, autoscaledPool, $ }) => {
            if (request.userData.label === 'start' || request.userData.label === 'list') {
                const paginationEle = $('.desc span');
                if (!paginationEle || paginationEle.text() === '') {
                    return;
                }

                if (request.userData.label === 'start' && paginationEle.text().includes('of')) {
                    const content = paginationEle.text().match(/of\s+(\d+[.,]?\d*[.,]?\d*)/)[1];
                    const pageCount = Math.floor(parseInt(content, 10) / 50); // Each page has 50 items

                    for (let index = 1; index < pageCount; index++) {
                        const startNumber = index * 50 + 1;
                        let startUrl = request.url;
                        startUrl += `${startUrl.split('?')[1] ? '&' : '?'}start=${startNumber}`;
                        await requestQueue.addRequest({ url: startUrl, userData: { label: 'list' } });
                    }
                }

                const itemLinks = $('.lister-list .lister-item a');

                for (const link of itemLinks) {
                    const href = $(link).attr('href');
                    if (href.includes('/title/')) {
                        const itemId = href.match(/\/title\/(\w{9})/)[1];
                        const itemUrl = `https://www.imdb.com/title/${itemId}/parentalguide`;

                        await requestQueue.addRequest({ url: `${itemUrl}`, userData: { label: 'parentalguide', id: itemId } },
                            { forefront: true });
                    }
                }
            } else if (request.userData.label === 'parentalguide') {
                const certificates = extractData(request, $);
                const itemCertificates = certificates.join(', ');
                const itemUrl = `https://www.imdb.com/title/${request.userData.id}`;

                await requestQueue.addRequest({ url: `${itemUrl}`, userData: { label: 'item', certificates: itemCertificates } },
                    { forefront: true });
            } else if (request.userData.label === 'item') {
                const pageResult = extractData(request, $);

                if (extendOutputFunction) {
                    const userResult = await extendOutputFunction($);
                    _.extend(pageResult, userResult);
                }

                await Apify.pushData(pageResult);

                if (++pagesOutputted >= input.maxItems) {
                    const msg = `Outputted ${pagesOutputted} pages, limit is ${input.maxItems} pages`;
                    console.log(`Shutting down the crawler: ${msg}`);
                    autoscaledPool.abort();
                }
            }
        },

        handleFailedRequestFunction: async ({ request }) => {
            await Apify.pushData({
                '#isFailed': true,
                '#debug': Apify.utils.createRequestDebugInfo(request),
            });
        },

        ...input.proxyConfiguration,
    });

    await crawler.run();
});
