## Features
Our free IMDb Scraper enables you to extract and download data about movies, video games, TV shows, streaming content, and personalities from [IMDb.com](https://www.imdb.com/).

## Why scrape IMDb with our unofficial API?
Launched over 30 years ago, IMDb now contains over 8 million titles and over 10 million personalities. It is the most comprehensive film and TV show database in the world.

IMDb datasets are frequently used to train AI models and recommendation systems and several different datasets are freely available to [download](https://www.imdb.com/interfaces/). You should also check out the [IMDb developer page](https://developer.imdb.com/) if you're interested in accessing data products direct from IMDb.

However, if your specific use case means that you need to scrape IMDb, our free IMDb Scraper effectively creates an unofficial IMDb API and gives you an alternative way to access live IMDb data direct from the website.

## Tutorial
Our [Beginner's Guide to Web Scraping](https://apify.com/web-scraping) has a really great explanation of how to get started with web scraping. And if you skip ahead to the section on [Web Scraping with Apify](https://apify.com/web-scraping#scraping-with-apify), you'll find a quick guide on how to use IMDb Scraper to scrape data about The Queens's Gambit. If you still have questions on how to use the scraper, just email support@apify.com.

## Cost of usage
Note that it is much more efficient to run one longer scrape (at least one minute) than more shorter ones because of the startup time.

Based on our experience, you can get **1,000 results for as little as $0.30** if you run the IMDb Scraper on
the [Apify platform](https://apify.com).

## Input

| Field | Type | Description | Default value
| ----- | ---- | ----------- | -------------|
| startUrls | array | List of [request](https://sdk.apify.com/docs/api/request#docsNav) objects that will be deeply crawled. The URL can be top level such as `https://www.imdb.com/search/title/` or `https://www.imdb.com/find?q=bond` or a detail URL, such as `https://www.imdb.com/title/tt7286456`. | `[{ "url": "https://www.imdb.com/search/title/" }]`|
| maxItems | number | Maximum number of actor pages that will be scraped | all found |
| extendOutputFunction | string | Function that takes a Cheerio handle ($) as argument and returns data that will be merged with the result output. More information in [Extend output function](#extend-output-function) | |
| proxyConfiguration | object | Proxy settings of the run. If you have access to Apify Proxy, leave the default settings. If not, you can set `{ "useApifyProxy": false" }` to disable proxy usage | `{ "useApifyProxy": true }`|

## Output

The IMDb Scraper output is stored in a dataset. Each item contains information about a movie, TV show, or other IMDb listing. For example:

```
{
  "title": "Turandot (1981)",
  "original title": "",
  "runtime": "",
  "certificate": "",
  "year": "1981",
  "rating": "",
  "ratingcount": "",
  "description": "",
  "stars": "Montserrat Caballé, Rémy Corazza, Fernand Dumont",
  "director": "Pierre Desfons",
  "genre": "Musical",
  "country": "France",
  "url": "https://www.imdb.com/title/tt0834174"
}
```

### Extend output function

You can use this function to update the result output of this actor. This function gets a Cheerio handle `$` as an argument so you can choose what data from the page you want to scrape. The output from this function will get merged with the result output.

The return value of this function has to be an object!

You can return fields to achive three different things:
- Add a new field - Return object with a field that is not in the result output
- Change a field - Return an existing field with a new value
- Remove a field - Return an existing field with a value `undefined`


```
($) => {
    return {
        "story line": $('#titleStoryLine div p span').text().trim(),
        "original title": "NA",
        url: undefined
    }
}
```
This example will add a new field `story line`, change the `original title` field and remove the `url` field
```
{
  "title": "Turandot (1981)",
  "story line": "",
  "original title": "NA",
  "runtime": "",
  "certificate": "",
  "year": "1981",
  "rating": "",
  "ratingcount": "",
  "description": "",
  "stars": "Montserrat Caballé, Rémy Corazza, Fernand Dumont",
  "director": "Pierre Desfons",
  "genre": "Musical",
  "country": "France"
}
```

## Changelog
IMDb Scraper is regularly updated, so please check the [changelog](https://github.com/dtrungtin/actor-imdb-scraper/blob/master/CHANGELOG.md) for fixes and improvements.
